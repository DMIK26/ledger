import { describe, expect, it } from 'vitest';
import { categoryTotals, kpis, lastMonths, monthSeries, previousMonth } from './aggregates';
import {
  budgetStatus,
  budgetsForMonth,
  copyFromPreviousMonth,
  daysLeft,
  moveAllocation,
  projectMonthEnd,
  snapToStep,
  suggestBudgets,
  toBudgetRows,
  whatIfMonthEnd,
} from './budgets';
import { fmtMoney } from './money';
import type { Budget, Transaction } from './types';

let n = 0;
const tx = (date: string, amountMinor: number, categoryId = 'food'): Transaction => ({
  id: `t${(n += 1)}`,
  date,
  amountMinor,
  currency: 'INR',
  merchant: 'X',
  categoryId,
  method: 'UPI',
  notes: '',
  tags: [],
  source: 'form',
  createdAt: n,
  updatedAt: n,
});

const TODAY = '2026-10-19';
const LIST = [
  tx('2026-10-01', 800000, 'housing'),
  tx('2026-10-18', 50000),
  tx('2026-10-18', 24000, 'transport'),
  tx('2026-09-05', 600000, 'housing'),
  tx('2026-09-25', 30000), // after the 19th: not in "last month to date"
  tx('2026-08-10', 90000),
  tx('2026-07-10', 120000, 'transport'),
  tx('2026-04-01', 100000), // outside six months
];

describe('aggregates', () => {
  it('lists the last six months, oldest first, across a year boundary', () => {
    expect(lastMonths(TODAY, 6)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(lastMonths('2026-02-10', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('totals categories largest first, and the series adds up', () => {
    expect(categoryTotals(LIST, '2026-10')).toEqual([
      { categoryId: 'housing', totalMinor: 800000 },
      { categoryId: 'food', totalMinor: 50000 },
      { categoryId: 'transport', totalMinor: 24000 },
    ]);
    const series = monthSeries(LIST, lastMonths(TODAY, 6));
    expect(series.map((p) => p.totalMinor)).toEqual([0, 0, 120000, 90000, 630000, 874000]);
    for (const p of series) {
      expect(Object.values(p.byCategory).reduce((a, b) => a + b, 0)).toBe(p.totalMinor);
    }
  });

  it('computes the KPIs against the same point last month', () => {
    const k = kpis(LIST, TODAY);
    expect(k.spentMinor).toBe(874000);
    expect(k.entries).toBe(3);
    expect(k.lastMonthToDateMinor).toBe(600000);
    expect(k.changePct).toBe(46);
    expect(k.dailyAvgMinor).toBe(Math.round(874000 / 19));
    expect(k.topCategory).toEqual({ categoryId: 'housing', totalMinor: 800000 });
    expect(kpis([], TODAY)).toMatchObject({ spentMinor: 0, changePct: null, topCategory: null });
  });

  it('compares 31 March with the end of February', () => {
    const k = kpis([tx('2026-02-28', 1000), tx('2026-03-31', 2000)], '2026-03-31');
    expect(k.lastMonthToDateMinor).toBe(1000);
    expect(k.changePct).toBe(100);
  });
});

describe('budgets', () => {
  it('snaps to ₹500', () => {
    expect(snapToStep(1_224_900)).toBe(1_200_000);
    expect(snapToStep(1_225_000)).toBe(1_250_000);
    expect(snapToStep(-30000)).toBe(0);
  });

  it('reads and writes a month of budgets, dropping zeros', () => {
    const rows = toBudgetRows('2026-10', {
      overall: 2_000_000,
      categories: { food: 500_000, other: 0 },
    });
    expect(rows.map((r) => r.id)).toEqual(['2026-10|overall', '2026-10|food']);
    expect(budgetsForMonth(rows, '2026-10')).toEqual({
      overall: 2_000_000,
      categories: { food: 500_000 },
    });
    expect(budgetsForMonth(rows, '2026-11')).toEqual({ overall: null, categories: {} });
  });

  it('describes status with words, not only colour', () => {
    expect(budgetStatus(50000, 100000)).toMatchObject({ kind: 'under', leftMinor: 50000 });
    expect(budgetStatus(85000, 100000).kind).toBe('near');
    expect(budgetStatus(120000, 100000)).toMatchObject({ kind: 'over', overMinor: 20000 });
  });

  it('projects the month end and answers what-if', () => {
    expect(daysLeft(TODAY)).toBe(12);
    expect(projectMonthEnd(190000, TODAY)).toBe(310000);
    expect(whatIfMonthEnd(190000, TODAY, 10000)).toBe(310000);
    expect(whatIfMonthEnd(190000, TODAY, 0)).toBe(190000);
  });

  it('suggests from three full months, rounded up to ₹500', () => {
    const s = suggestBudgets(LIST, TODAY);
    // Sep, Aug, Jul: housing 6000/3 = 2000; food (300 + 900)/3 = 400 → 500; transport 1200/3 = 400 → 500.
    expect(s.categories).toEqual({ housing: 200000, food: 50000, transport: 50000 });
    expect(s.overall).toBe(300000);
    // Rounding categories up can exceed the rounded total; the overall budget covers them.
    const many = suggestBudgets(
      [tx('2026-09-02', 10000, 'food'), tx('2026-09-02', 10000, 'groceries')],
      TODAY,
    );
    expect(many.categories).toEqual({ food: 50000, groceries: 50000 });
    expect(many.overall).toBe(100000);
  });

  it('copies last month', () => {
    const rows: Budget[] = toBudgetRows('2026-09', {
      overall: 100000,
      categories: { food: 50000 },
    });
    expect(copyFromPreviousMonth(rows, '2026-10')).toEqual({
      overall: 100000,
      categories: { food: 50000 },
    });
  });

  it('moves budget across a divider with the total fixed', () => {
    const segs = [
      { id: 'a', amountMinor: 100000 },
      { id: 'b', amountMinor: 200000 },
      { id: 'c', amountMinor: 50000 },
    ];
    const total = (s: typeof segs) => s.reduce((x, y) => x + y.amountMinor, 0);
    const moved = moveAllocation(segs, 0, 70000);
    expect(moved.map((s) => s.amountMinor)).toEqual([150000, 150000, 50000]);
    expect(total(moved)).toBe(total(segs));
    expect(moveAllocation(segs, 1, 999999).map((s) => s.amountMinor)).toEqual([100000, 250000, 0]);
    expect(moveAllocation(segs, 0, -999999).map((s) => s.amountMinor)).toEqual([0, 300000, 50000]);
  });
});

describe('compact amounts', () => {
  it('reads ₹10k, never ₹10K or decimals', () => {
    expect(fmtMoney(1_000_000, { compact: true })).toBe('₹10k');
    expect(fmtMoney(25_000_000, { compact: true })).toBe('₹2.5L');
  });
});

describe('compact labels in every currency', () => {
  it('uses k, L and Cr for rupees and k, M for others', () => {
    expect(fmtMoney(0, { compact: true })).toBe('₹0');
    expect(fmtMoney(50_000, { compact: true })).toBe('₹500');
    expect(fmtMoney(1_200_000, { compact: true })).toBe('₹12k');
    expect(fmtMoney(1_250_000_000, { compact: true })).toBe('₹1.3Cr');
    expect(fmtMoney(250_000_000, { compact: true, currency: 'USD' })).toBe('$2.5M');
  });
});
