import { describe, expect, it } from 'vitest';
import { parseQuickEntry } from '../domain/parser';
import { exportBackup, validateBackup } from './backup';
import { setWriteSpace } from './commands';
import { createLedgerStore, type EntryDraft } from './store';

const fresh = async () => {
  const s = createLedgerStore(`drop13-${Math.random().toString(36).slice(2)}`);
  await s.getState().init();
  return s;
};

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  date: '2026-10-18',
  amountMinor: 90_000,
  merchant: 'Dinner',
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
  ...over,
});

describe('spaces', () => {
  it('keep each ledger to itself and show both together when asked', async () => {
    const s = await fresh();
    try {
      await s.getState().addEntry(draft({ merchant: 'Groceries at home' }));
      await s.getState().setSetting('spacesOn', true);
      await s.getState().setSetting('space', 'shop');
      expect(s.getState().transactions).toEqual([]);
      await s.getState().addEntry(draft({ merchant: 'Cement bags', categoryId: 'business' }));
      await s.getState().addFromParsed(parseQuickEntry('loading 500', { today: '2026-10-18' }));
      await s.getState().addIncome({
        date: '2026-10-18',
        amountMinor: 1_000_000,
        label: 'Sales',
        incomeKind: 'business',
      });
      await s.getState().saveAccount({
        name: 'Shop current account',
        kind: 'bank',
        openingMinor: 0,
        openingDate: '2026-10-01',
        methods: ['UPI'],
      });
      await s.getState().setMonthBudgets('2026-10', { overall: 5_000_000, categories: {} });
      expect(
        s
          .getState()
          .transactions.map((t) => t.merchant)
          .sort(),
      ).toEqual(['Cement bags', 'Loading']);
      expect(s.getState().transactions.every((t) => t.space === 'shop')).toBe(true);
      expect(s.getState().flows.map((f) => f.space)).toEqual(['shop']);
      expect(s.getState().budgets).toEqual([
        {
          id: 'shop|2026-10|overall',
          month: '2026-10',
          scope: 'overall',
          amountMinor: 5_000_000,
          space: 'shop',
        },
      ]);

      await s.getState().setSetting('space', 'personal');
      expect(s.getState().transactions.map((t) => t.merchant)).toEqual(['Groceries at home']);
      expect(s.getState().flows).toEqual([]);
      expect(s.getState().accounts).toEqual([]);
      expect(s.getState().budgets).toEqual([]);
      // A personal budget for the same month lives beside the shop's.
      await s.getState().setMonthBudgets('2026-10', { overall: 3_000_000, categories: {} });
      expect(s.getState().budgets.map((b) => b.id)).toEqual(['2026-10|overall']);

      await s.getState().setSetting('space', 'both');
      expect(s.getState().transactions).toHaveLength(3);
      expect(s.getState().budgets).toEqual([]);
      expect(s.getState().everything.budgets).toHaveLength(2);

      // Turning spaces off shows Personal; nothing is deleted.
      await s.getState().setSetting('spacesOn', false);
      expect(s.getState().transactions).toHaveLength(1);
      expect(s.getState().everything.transactions).toHaveLength(3);
    } finally {
      setWriteSpace('personal');
    }
  });

  it('move entries to the other ledger in one step, and back with undo', async () => {
    const s = await fresh();
    try {
      await s.getState().setSetting('spacesOn', true);
      await s.getState().addEntry(draft({ merchant: 'Tea for staff' }));
      const id = s.getState().transactions[0]!.id;
      await s.getState().moveToSpace([id], 'shop');
      expect(s.getState().transactions).toEqual([]);
      expect(s.getState().undoLabel).toBe('Moved 1 entry to Shop');
      await s.getState().setSetting('space', 'shop');
      expect(s.getState().transactions.map((t) => t.id)).toEqual([id]);
      await s.getState().undo();
      expect(s.getState().transactions).toEqual([]);
      await s.getState().setSetting('space', 'personal');
      expect(s.getState().transactions[0]!.space).toBeUndefined();
    } finally {
      setWriteSpace('personal');
    }
  });

  it('back up every ledger, and merging one back adds nothing twice', async () => {
    const s = await fresh();
    try {
      await s.getState().setSetting('spacesOn', true);
      await s.getState().addEntry(draft({ merchant: 'Home' }));
      await s.getState().setSetting('space', 'shop');
      await s.getState().addEntry(draft({ merchant: 'Shop rent' }));
      const file = await exportBackup(s.getState().getDb());
      expect(file.data.transactions.map((t) => [t.merchant, t.space ?? 'personal']).sort()).toEqual(
        [
          ['Home', 'personal'],
          ['Shop rent', 'shop'],
        ],
      );
      // Importing while the Shop is on screen keeps each row in its own ledger.
      const other = await fresh();
      await other.getState().setSetting('spacesOn', true);
      await other.getState().setSetting('space', 'shop');
      await other.getState().importFromBackup(validateBackup(JSON.parse(JSON.stringify(file)))!);
      expect(other.getState().transactions.map((t) => t.merchant)).toEqual(['Shop rent']);
      await other.getState().setSetting('space', 'personal');
      expect(other.getState().transactions.map((t) => t.merchant)).toEqual(['Home']);
      // The same file again, from Personal: nothing new.
      expect(
        await other.getState().importFromBackup(validateBackup(JSON.parse(JSON.stringify(file)))!),
      ).toBe(0);
    } finally {
      setWriteSpace('personal');
    }
  });

  it('restoring a backup with a Shop ledger turns Spaces on, with its name', async () => {
    const s = await fresh();
    try {
      await s.getState().setSetting('spacesOn', true);
      await s.getState().setSetting('shopName', 'Ravi Hardware');
      await s.getState().setSetting('space', 'shop');
      await s.getState().addEntry(draft({ merchant: 'Shop rent' }));
      const file = validateBackup(
        JSON.parse(JSON.stringify(await exportBackup(s.getState().getDb()))),
      )!;
      setWriteSpace('personal');
      const other = await fresh();
      expect(other.getState().settings.spacesOn).toBe(false);
      await other.getState().restoreBackup(file);
      expect(other.getState().settings.spacesOn).toBe(true);
      expect(other.getState().settings.shopName).toBe('Ravi Hardware');
      await other.getState().setSetting('space', 'shop');
      expect(other.getState().transactions.map((t) => t.merchant)).toEqual(['Shop rent']);
    } finally {
      setWriteSpace('personal');
    }
  });
});

describe('sample data for every feature', () => {
  it('loads an example into every list and removes exactly that again', async () => {
    const s = await fresh();
    await s.getState().addEntry(draft({ merchant: 'Mine' }));
    await s.getState().loadSampleData();
    const st = s.getState();
    for (const list of [
      st.accounts,
      st.flows,
      st.people,
      st.udhaar,
      st.loans,
      st.goals,
      st.wishlist,
      st.assets,
      st.projects,
    ])
      expect(list.length).toBeGreaterThan(0);
    expect(st.transactions.some((t) => t.projectId === 'sample-project-1')).toBe(true);
    expect(st.transactions.some((t) => t.taxSection === '80D')).toBe(true);
    expect(st.transactions.some((t) => t.warrantyMonths)).toBe(true);
    expect(st.transactions.some((t) => t.unsure)).toBe(true);

    await s.getState().removeSampleData();
    const after = s.getState();
    expect(after.transactions.map((t) => t.merchant)).toEqual(['Mine']);
    for (const list of [after.accounts, after.flows, after.people, after.loans, after.projects])
      expect(list).toEqual([]);
    await s.getState().undo();
    expect(s.getState().accounts.length).toBe(3);
  });
});
