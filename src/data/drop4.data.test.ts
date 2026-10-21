import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { planCsvImport } from '../domain/csvImport';
import { exportBackup, validateBackup } from './backup';
import { createLedgerStore, type EntryDraft } from './store';

const fresh = async () => {
  const s = createLedgerStore(`drop4-${Math.random().toString(36).slice(2)}`);
  await s.getState().init();
  return s;
};

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  date: '2026-10-18',
  amountMinor: 50000,
  merchant: 'Shawarma',
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
  ...over,
});

describe('category manager', () => {
  it('adds, renames, recolours and reorders, each undoable', async () => {
    const s = await fresh();
    const id = await s.getState().addCategory('Pets');
    expect(s.getState().categories.at(-1)).toMatchObject({ id, name: 'Pets', order: 10 });
    await s.getState().renameCategory(id, 'Pets & vet');
    expect(s.getState().categories.find((c) => c.id === id)?.name).toBe('Pets & vet');
    // Default names are kept.
    await s.getState().renameCategory('food', 'Eating');
    expect(s.getState().categories.find((c) => c.id === 'food')?.name).toBe('Food & Dining');
    const colorOf = (cid: string) => s.getState().categories.find((c) => c.id === cid)!.color;
    const [housing, food] = [colorOf('housing'), colorOf('food')];
    const before = s
      .getState()
      .categories.map((c) => c.color)
      .sort();
    await s.getState().recolorCategory('food', housing);
    // The two swap, so no new duplicate appears.
    expect([colorOf('food'), colorOf('housing')]).toEqual([housing, food]);
    expect(
      s
        .getState()
        .categories.map((c) => c.color)
        .sort(),
    ).toEqual(before);
    await s.getState().moveCategory(id, 0);
    expect(s.getState().categories[0]?.id).toBe(id);
    await s.getState().undo();
    expect(s.getState().categories[0]?.id).toBe('housing');
  });

  it('deletes a category only by moving everything to another, and undo brings it all back', async () => {
    const s = await fresh();
    const id = await s.getState().addCategory('Pets');
    await s.getState().addEntry(draft({ merchant: 'Vet', categoryId: id }));
    await s.getState().addEntry(draft({ merchant: 'Kibble', categoryId: id }));
    await s.getState().addEntry(draft({ merchant: 'Zorblax', categoryId: id })); // learns a rule
    await s
      .getState()
      .removeTransaction(s.getState().transactions.find((t) => t.merchant === 'Kibble')!.id);
    await s
      .getState()
      .setMonthBudgets('2026-10', { overall: null, categories: { [id]: 100_000, other: 50_000 } });

    await s.getState().deleteCategory(id, 'other');
    const st = s.getState();
    expect(st.categories.some((c) => c.id === id)).toBe(false);
    expect(st.transactions.every((t) => t.categoryId === 'other')).toBe(true);
    expect(st.trash[0]?.tx.categoryId).toBe('other');
    expect(st.rules.zorblax).toBe('other');
    expect(st.budgets.find((b) => b.id === '2026-10|other')?.amountMinor).toBe(150_000);

    await s.getState().undo();
    const back = s.getState();
    expect(back.categories.some((c) => c.id === id)).toBe(true);
    expect(back.transactions.filter((t) => t.categoryId === id)).toHaveLength(2);
    expect(back.rules.zorblax).toBe(id);
    expect(back.budgets.find((b) => b.id === `2026-10|${id}`)?.amountMinor).toBe(100_000);
  });

  it('refuses to delete default categories', async () => {
    const s = await fresh();
    await s.getState().deleteCategory('food', 'other');
    expect(s.getState().categories).toHaveLength(DEFAULT_CATEGORIES.length);
  });
});

describe('recurring payments', () => {
  it('saves, moves by days, removes and ignores, all undoable', async () => {
    const s = await fresh();
    const item = {
      id: 'r1',
      merchant: 'Netflix',
      categoryId: 'entertainment',
      method: 'Card' as const,
      amountMinor: 64900,
      cadence: 'monthly' as const,
      anchor: '2026-10-05',
      createdAt: 1,
    };
    await s.getState().saveRecurring(item);
    await s.getState().shiftRecurring('r1', 3);
    expect(s.getState().recurring[0]?.anchor).toBe('2026-10-08');
    await s.getState().undo();
    expect(s.getState().recurring[0]?.anchor).toBe('2026-10-05');
    await s.getState().ignoreRecurring('chai');
    expect(s.getState().recurringIgnored).toEqual(['chai']);
    await s.getState().deleteRecurring('r1');
    expect(s.getState().recurring).toHaveLength(0);
    await s.getState().undo();
    expect(s.getState().recurring).toHaveLength(1);
  });
});

describe('csv import and full restore', () => {
  it('imports a plan as one undo step, with new categories', async () => {
    const s = await fresh();
    const plan = planCsvImport(
      [
        ['18/10/2026', 'Plants', '300', 'Garden'],
        ['19/10/2026', 'Chai', '20', ''],
      ],
      { date: 0, merchant: 1, amount: 2, category: 3, method: -1, tags: -1, notes: -1 },
      {
        categories: s.getState().categories,
        rules: {},
        existing: [],
        currency: 'INR',
        lastMethod: 'UPI',
        now: 1,
        newId: (() => {
          let i = 0;
          return () => `csv-${(i += 1)}`;
        })(),
        dateOrder: 'dmy',
      },
    );
    await s.getState().importCsv(plan);
    expect(s.getState().transactions).toHaveLength(2);
    expect(s.getState().categories.some((c) => c.name === 'Garden')).toBe(true);
    await s.getState().undo();
    expect(s.getState().transactions).toHaveLength(0);
    expect(s.getState().categories.some((c) => c.name === 'Garden')).toBe(false);
  });

  it('restores a backup exactly, recurring included, and undo puts the device back', async () => {
    const a = await fresh();
    await a.getState().addEntry(draft({ merchant: 'From backup' }));
    await a.getState().saveRecurring({
      id: 'r',
      merchant: 'Gym',
      categoryId: 'health',
      method: 'UPI',
      amountMinor: 120000,
      cadence: 'monthly',
      anchor: '2026-10-02',
      createdAt: 1,
    });
    const file = validateBackup(
      JSON.parse(JSON.stringify(await exportBackup(a.getState().getDb()))),
    )!;
    expect(file.data.recurring).toHaveLength(1);

    const b = await fresh();
    await b.getState().addEntry(draft({ merchant: 'Only here' }));
    await b.getState().restoreBackup(file);
    expect(b.getState().transactions.map((t) => t.merchant)).toEqual(['From backup']);
    expect(b.getState().recurring.map((r) => r.merchant)).toEqual(['Gym']);
    await b.getState().undo();
    expect(b.getState().transactions.map((t) => t.merchant)).toEqual(['Only here']);
    expect(b.getState().recurring).toHaveLength(0);
  });

  it('lists activity newest first', async () => {
    const s = await fresh();
    await s.getState().addEntry(draft({ merchant: 'One' }));
    await s.getState().addEntry(draft({ merchant: 'Two' }));
    await s.getState().undo();
    const log = await s.getState().getActivity();
    expect(log.map((e) => [e.action, e.label])).toEqual([
      ['undo', 'Added Two'],
      ['do', 'Added Two'],
      ['do', 'Added One'],
    ]);
  });
});
