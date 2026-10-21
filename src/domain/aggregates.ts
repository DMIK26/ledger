import { daysInMonth, isoFromYMD, monthKey, parseISO, shiftMonth } from './dates';
import type { CategoryId, ISODate, Transaction } from './types';

export interface CategoryTotal {
  categoryId: CategoryId;
  totalMinor: number;
}

export const inMonth = (list: readonly Transaction[], month: string): Transaction[] =>
  list.filter((t) => monthKey(t.date) === month);

export const sumMinor = (list: readonly Transaction[]): number =>
  list.reduce((s, t) => s + t.amountMinor, 0);

/** Per-category totals for a month, largest first (ties by category id for a stable order). */
export function categoryTotals(list: readonly Transaction[], month: string): CategoryTotal[] {
  const map = new Map<CategoryId, number>();
  for (const t of inMonth(list, month))
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amountMinor);
  return [...map.entries()]
    .map(([categoryId, totalMinor]) => ({ categoryId, totalMinor }))
    .sort((a, b) => b.totalMinor - a.totalMinor || a.categoryId.localeCompare(b.categoryId));
}

/** The last `n` month keys ending with today's month, oldest first. */
export function lastMonths(today: ISODate, n: number): string[] {
  const p = parseISO(today);
  if (!p) return [];
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const { y, m } = shiftMonth(p.y, p.m, -i);
    out.push(isoFromYMD(y, m, 1).slice(0, 7));
  }
  return out;
}

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const prev = shiftMonth(y ?? 2000, m ?? 1, -1);
  return isoFromYMD(prev.y, prev.m, 1).slice(0, 7);
}

export interface MonthPoint {
  month: string;
  totalMinor: number;
  byCategory: Record<CategoryId, number>;
}

export function monthSeries(list: readonly Transaction[], months: readonly string[]): MonthPoint[] {
  const points = new Map<string, MonthPoint>(
    months.map((m) => [m, { month: m, totalMinor: 0, byCategory: {} }]),
  );
  for (const t of list) {
    const p = points.get(monthKey(t.date));
    if (!p) continue;
    p.totalMinor += t.amountMinor;
    p.byCategory[t.categoryId] = (p.byCategory[t.categoryId] ?? 0) + t.amountMinor;
  }
  return months.map((m) => points.get(m)!);
}

export interface Kpis {
  month: string;
  spentMinor: number;
  entries: number;
  /** Spent last month from the 1st up to the same day of the month. */
  lastMonthToDateMinor: number;
  /** Whole-percent change against that, or null when last month had nothing to compare. */
  changePct: number | null;
  dailyAvgMinor: number;
  daysElapsed: number;
  topCategory: CategoryTotal | null;
}

export function kpis(list: readonly Transaction[], today: ISODate): Kpis {
  const p = parseISO(today)!;
  const month = monthKey(today);
  const current = inMonth(list, month).filter((t) => t.date <= today);
  const spentMinor = sumMinor(current);
  const last = previousMonth(month);
  const [ly, lm] = last.split('-').map(Number);
  const cutoff = isoFromYMD(ly!, lm!, Math.min(p.d, daysInMonth(ly!, lm!)));
  const lastMonthToDateMinor = sumMinor(inMonth(list, last).filter((t) => t.date <= cutoff));
  const changePct =
    lastMonthToDateMinor > 0
      ? Math.round(((spentMinor - lastMonthToDateMinor) / lastMonthToDateMinor) * 100)
      : null;
  const totals = categoryTotals(current, month);
  return {
    month,
    spentMinor,
    entries: current.length,
    lastMonthToDateMinor,
    changePct,
    dailyAvgMinor: Math.round(spentMinor / p.d),
    daysElapsed: p.d,
    topCategory: totals[0] ?? null,
  };
}
