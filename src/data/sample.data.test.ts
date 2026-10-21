import { describe, expect, it } from 'vitest';
import { createLedgerStore, type EntryDraft } from './store';

const draft: EntryDraft = {
  date: '2026-10-18',
  amountMinor: 50000,
  merchant: 'Mine',
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
};

describe('loading and removing sample data', () => {
  it('adds the sample alongside real entries and removes exactly it, undoably', async () => {
    const s = createLedgerStore(`sample-${Math.random().toString(36).slice(2)}`);
    await s.getState().init();
    await s.getState().addEntry(draft);
    await s.getState().loadSampleData();
    const loaded = s.getState().transactions.length;
    expect(loaded).toBeGreaterThan(100);
    expect(s.getState().recurring).toHaveLength(5);
    expect(s.getState().budgets.length).toBeGreaterThan(0);
    expect(s.getState().sample).not.toBeNull();

    // Loading twice does nothing.
    await s.getState().loadSampleData();
    expect(s.getState().transactions).toHaveLength(loaded);

    // A sample budget the user changes is theirs and stays.
    const month = s.getState().budgets[0]!.month;
    const before = s.getState().budgets.filter((b) => b.month === month);
    await s.getState().setMonthBudgets(month, { overall: 1_234_500, categories: {} });

    await s.getState().removeSampleData();
    expect(s.getState().transactions.map((t) => t.merchant)).toEqual(['Mine']);
    expect(s.getState().recurring).toEqual([]);
    expect(s.getState().budgets.map((b) => b.amountMinor)).toEqual([1_234_500]);
    expect(s.getState().sample).toBeNull();
    expect(before.length).toBeGreaterThan(1);

    await s.getState().undo();
    expect(s.getState().transactions).toHaveLength(loaded);
    expect(s.getState().sample).not.toBeNull();
  });
});
