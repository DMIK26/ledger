import { describe, expect, it } from 'vitest';
import { createLedgerStore, type EntryDraft } from './store';

const draft = (merchant: string): EntryDraft => ({
  date: '2026-10-18',
  amountMinor: 50000,
  merchant,
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
});

describe('undo history', () => {
  it('lists undoable steps newest first and undoes back to an exact earlier state', async () => {
    const s = createLedgerStore(`drop5-${Math.random().toString(36).slice(2)}`);
    await s.getState().init();
    await s.getState().addEntry(draft('A'));
    const afterA = structuredClone(s.getState().transactions);
    await s.getState().addEntry(draft('B'));
    await s.getState().setMonthBudgets('2026-10', { overall: 100_000, categories: {} });
    await s.getState().addEntry(draft('C'));
    expect(s.getState().history).toEqual(['Added C', 'Updated budgets', 'Added B', 'Added A']);
    await s.getState().undoMany(3);
    expect(s.getState().transactions).toEqual(afterA);
    expect(s.getState().budgets).toEqual([]);
    expect(s.getState().history).toEqual(['Added A']);
    expect(s.getState().redoLabel).toBe('Added B');
    // Redo replays in the original order.
    await s.getState().redo();
    await s.getState().redo();
    await s.getState().redo();
    expect(
      s
        .getState()
        .transactions.map((t) => t.merchant)
        .sort(),
    ).toEqual(['A', 'B', 'C']);
    expect(s.getState().budgets).toHaveLength(1);
  });
});
