import { describe, expect, it } from 'vitest';
import { balances } from '../domain/accounts';
import { personBalance } from '../domain/udhaar';
import { exportBackup, validateBackup } from './backup';
import { setRule } from './commands';
import { createLedgerStore, type EntryDraft } from './store';

const fresh = async () => {
  const s = createLedgerStore(`drop11-${Math.random().toString(36).slice(2)}`);
  await s.getState().init();
  return s;
};
type Store = Awaited<ReturnType<typeof fresh>>;

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

const person = (s: Store, name: string) => s.getState().people.find((p) => p.name === name)!;
const bank = async (s: Store) =>
  s.getState().saveAccount({
    name: 'HDFC',
    kind: 'bank',
    openingMinor: 1_000_000,
    openingDate: '2026-01-01',
    methods: ['UPI'],
  });
const balanceOf = (s: Store, id: string) =>
  balances(
    s.getState().accounts,
    {
      transactions: s.getState().transactions,
      flows: s.getState().flows,
      udhaar: s.getState().udhaar,
    },
    '2026-12-31',
  )[id];

describe('splits', () => {
  it('paid by you: your share is spending, the others owe you theirs, and the account pays the bill', async () => {
    const s = await fresh();
    const hdfc = await bank(s);
    await s
      .getState()
      .saveUdhaar({
        personName: 'Rahul',
        kind: 'lent',
        date: '2026-10-01',
        amountMinor: 100,
        note: '',
      });
    await s.getState().deleteUdhaar(s.getState().udhaar[0]!.id);
    const rahul = person(s, 'Rahul');
    await s.getState().addEntry(
      draft({
        split: {
          mode: 'equal',
          paidBy: null,
          parts: [
            { personId: null, value: 0 },
            { personId: rahul.id, value: 0 },
            { personName: 'Priya', value: 0 },
          ],
        },
      }),
    );
    const tx = s.getState().transactions[0]!;
    expect(tx.amountMinor).toBe(30_000);
    expect(tx.split).toMatchObject({ totalMinor: 90_000, paidBy: null });
    const priya = person(s, 'Priya');
    expect(personBalance(s.getState().udhaar, rahul.id)).toBe(30_000);
    expect(personBalance(s.getState().udhaar, priya.id)).toBe(30_000);
    expect(
      s.getState().udhaar.every((u) => u.accountId === hdfc && u.note === 'Split: Dinner'),
    ).toBe(true);
    expect(balanceOf(s, hdfc)).toBe(1_000_000 - 90_000);
    expect(s.getState().undoLabel).toBe('Added Dinner');
    await s.getState().undo();
    expect(s.getState().transactions).toHaveLength(0);
    expect(s.getState().udhaar).toHaveLength(0);
    expect(s.getState().people.map((p) => p.name)).toEqual(['Rahul']);
  });

  it('paid by someone else: you owe them your share and none of your accounts moves', async () => {
    const s = await fresh();
    const hdfc = await bank(s);
    await s.getState().addEntry(
      draft({
        amountMinor: 120_000,
        split: {
          mode: 'shares',
          paidBy: { personName: 'Rahul' },
          parts: [
            { personId: null, value: 1 },
            { personName: 'Rahul', value: 1 },
            { personName: 'Priya', value: 1 },
          ],
        },
      }),
    );
    expect(s.getState().transactions[0]!.amountMinor).toBe(40_000);
    expect(personBalance(s.getState().udhaar, person(s, 'Rahul').id)).toBe(-40_000);
    expect(s.getState().udhaar).toHaveLength(1);
    expect(s.getState().people).toHaveLength(2);
    expect(balanceOf(s, hdfc)).toBe(1_000_000);
  });

  it('editing redoes the udhaar, removing the split removes it, and Trash brings it back', async () => {
    const s = await fresh();
    const split = {
      mode: 'equal' as const,
      paidBy: null,
      parts: [
        { personId: null, value: 0 },
        { personName: 'Rahul', value: 0 },
      ],
    };
    await s.getState().addEntry(draft({ amountMinor: 50_000, split }));
    const id = s.getState().transactions[0]!.id;
    const rahul = person(s, 'Rahul');
    await s.getState().editTransaction(
      id,
      draft({
        amountMinor: 80_000,
        split: {
          ...split,
          parts: [
            { personId: null, value: 0 },
            { personId: rahul.id, value: 0 },
          ],
        },
      }),
    );
    expect(s.getState().transactions[0]!.amountMinor).toBe(40_000);
    expect(s.getState().udhaar).toHaveLength(1);
    expect(personBalance(s.getState().udhaar, rahul.id)).toBe(40_000);
    await s.getState().removeTransaction(id);
    expect(s.getState().udhaar).toHaveLength(0);
    await s.getState().restore(id);
    expect(personBalance(s.getState().udhaar, rahul.id)).toBe(40_000);
    await s.getState().editTransaction(id, draft({ amountMinor: 40_000, split: null }));
    expect(s.getState().transactions[0]!.split).toBeUndefined();
    expect(s.getState().udhaar).toHaveLength(0);
  });

  it('marks every open split settled as udhaar settle-ups, in one undoable step', async () => {
    const s = await fresh();
    await s.getState().addEntry(
      draft({
        split: {
          mode: 'equal',
          paidBy: null,
          parts: [
            { personId: null, value: 0 },
            { personName: 'P1', value: 0 },
            { personName: 'P2', value: 0 },
          ],
        },
      }),
    );
    const p1 = person(s, 'P1');
    const p2 = person(s, 'P2');
    await s.getState().addEntry(
      draft({
        amountMinor: 60_000,
        merchant: 'Cab',
        split: {
          mode: 'equal',
          paidBy: { personId: p1.id },
          parts: [
            { personId: null, value: 0 },
            { personId: p1.id, value: 0 },
            { personId: p2.id, value: 0 },
          ],
        },
      }),
    );
    expect(personBalance(s.getState().udhaar, p1.id)).toBe(30_000 - 20_000);
    await s.getState().settleSplits();
    expect(personBalance(s.getState().udhaar, p1.id)).toBe(0);
    expect(personBalance(s.getState().udhaar, p2.id)).toBe(0);
    expect(s.getState().settledSplits).toHaveLength(2);
    expect(s.getState().undoLabel).toBe('Settled all splits');
    await s.getState().undo();
    expect(s.getState().settledSplits).toHaveLength(0);
    expect(personBalance(s.getState().udhaar, p2.id)).toBe(30_000);
  });
});

describe('review and the learning rule', () => {
  it('confirms or moves unsure entries and learns a first-time merchant', async () => {
    const s = await fresh();
    await s.getState().addEntry(draft({ merchant: 'Xyzcorp', categoryId: 'other' }));
    const id = s.getState().transactions[0]!.id;
    // Make it a guess the user has not confirmed.
    await s.getState().run({
      label: 'test',
      apply: async (db) => {
        await db.put('transactions', { ...s.getState().transactions[0]!, unsure: true });
      },
      revert: async () => {},
    });
    await s.getState().reviewEntry(id, 'shopping');
    expect(s.getState().transactions[0]).toMatchObject({ categoryId: 'shopping', unsure: false });
    expect(s.getState().rules.xyzcorp).toBe('shopping');
    expect(s.getState().undoLabel).toBe('Moved Xyzcorp to Shopping & Essentials');
    await s.getState().undo();
    expect(s.getState().rules.xyzcorp).toBeUndefined();
  });

  it('changes a known merchant’s category only when two of its last three entries agree', async () => {
    const s = await fresh();
    await s.getState().run(setRule({ key: 'swiggy', categoryId: 'food', updatedAt: 0 }));
    await s.getState().addEntry(draft({ merchant: 'Swiggy', date: '2026-10-01' }));
    await s.getState().addEntry(draft({ merchant: 'Swiggy', date: '2026-10-05' }));
    await s.getState().addEntry(draft({ merchant: 'Swiggy', date: '2026-10-09' }));
    const [newest, middle] = s.getState().transactions;
    await s
      .getState()
      .editTransaction(
        newest!.id,
        draft({ merchant: 'Swiggy', date: '2026-10-09', categoryId: 'groceries' }),
      );
    expect(s.getState().rules.swiggy).toBe('food');
    await s
      .getState()
      .editTransaction(
        middle!.id,
        draft({ merchant: 'Swiggy', date: '2026-10-05', categoryId: 'groceries' }),
      );
    expect(s.getState().rules.swiggy).toBe('groceries');
  });
});

describe('entry history', () => {
  it('lists what happened to one entry, newest first', async () => {
    const s = await fresh();
    await s.getState().addEntry(draft({ merchant: 'Chai' }));
    await s.getState().addEntry(draft({ merchant: 'Other one' }));
    const chai = s.getState().transactions.find((t) => t.merchant === 'Chai')!;
    await s.getState().editTransaction(chai.id, draft({ merchant: 'Chai', amountMinor: 2_500 }));
    await s.getState().undo();
    const h = await s.getState().getEntryHistory(chai.id);
    expect(h.map((e) => `${e.action} ${e.label}`)).toEqual([
      'undo Edited Chai',
      'do Edited Chai',
      'do Added Chai',
    ]);
  });
});

describe('backups', () => {
  it('carry settled splits', async () => {
    const s = await fresh();
    await s.getState().addEntry(
      draft({
        split: {
          mode: 'equal',
          paidBy: null,
          parts: [
            { personId: null, value: 0 },
            { personName: 'P1', value: 0 },
          ],
        },
      }),
    );
    await s.getState().settleSplits();
    const file = validateBackup(
      JSON.parse(JSON.stringify(await exportBackup(s.getState().getDb()))),
    );
    expect(file?.data.settledSplits).toHaveLength(1);
    expect(file?.data.transactions[0]?.split?.parts).toHaveLength(2);
    const other = await fresh();
    await other.getState().importFromBackup(file!);
    expect(other.getState().settledSplits).toHaveLength(1);
  });
});
