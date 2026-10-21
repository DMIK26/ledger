import { describe, expect, it } from 'vitest';
import { buildSample, isSampleId } from './sample';
import { budgetId } from './budgets';

describe('sample data', () => {
  const s = buildSample('2026-10-19');

  it('covers about three months up to today, nothing in the future, all marked as sample', () => {
    const dates = s.transactions.map((t) => t.date).sort();
    expect(dates[0]! >= '2026-08-01').toBe(true);
    expect(dates.at(-1)! <= '2026-10-19').toBe(true);
    expect(s.transactions.length).toBeGreaterThan(100);
    expect(s.transactions.length).toBeLessThan(400);
    expect([...s.transactions, ...s.recurring].every((x) => isSampleId(x.id))).toBe(true);
    expect(new Set(s.transactions.map((t) => t.id)).size).toBe(s.transactions.length);
  });

  it('is the same every time and uses whole rupees in integer paise', () => {
    expect(buildSample('2026-10-19')).toEqual(s);
    expect(
      s.transactions.every((t) => Number.isInteger(t.amountMinor) && t.amountMinor % 100 === 0),
    ).toBe(true);
  });

  it('has rent each month and five recurring payments', () => {
    expect(s.transactions.filter((t) => t.merchant === 'Rent').map((t) => t.date)).toEqual([
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(s.recurring).toHaveLength(5);
  });

  it('adds budgets only to months that have none', () => {
    expect(s.budgets.some((b) => b.id === budgetId('2026-10', 'overall'))).toBe(true);
    const mine = [
      { id: budgetId('2026-10', 'overall'), month: '2026-10', scope: 'overall', amountMinor: 1 },
    ];
    const t = buildSample('2026-10-19', mine);
    expect(t.budgets.some((b) => b.month === '2026-10')).toBe(false);
    expect(t.budgets.some((b) => b.month === '2026-09')).toBe(true);
  });
});
