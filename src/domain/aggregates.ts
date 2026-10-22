import { addDays, monthBounds, monthKey, monthProgress, parseISO, shiftMonthKey } from './dates';
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
  if (!parseISO(today)) return [];
  const current = monthKey(today);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(shiftMonthKey(current, -i));
  return out;
}

export const previousMonth = (month: string): string => shiftMonthKey(month, -1);

/**
 * The same point in the month before: with today on day 5 of its month, day 5 of the previous one
 * (or that month's last day when it is shorter).
 */
export function samePointLastMonth(today: ISODate): ISODate {
  const { day } = monthProgress(today);
  const prev = monthBounds(previousMonth(monthKey(today)));
  const point = addDays(prev.start, day - 1);
  return point > prev.end ? prev.end : point;
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
  /** Spent last month from its first day up to the same point in the month. */
  lastMonthToDateMinor: number;
  /** Whole-percent change against that, or null when last month had nothing to compare. */
  changePct: number | null;
  dailyAvgMinor: number;
  daysElapsed: number;
  topCategory: CategoryTotal | null;
}

export function kpis(list: readonly Transaction[], today: ISODate): Kpis {
  const { day } = monthProgress(today);
  const month = monthKey(today);
  const current = inMonth(list, month).filter((t) => t.date <= today);
  const spentMinor = sumMinor(current);
  const last = previousMonth(month);
  const cutoff = samePointLastMonth(today);
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
    dailyAvgMinor: Math.round(spentMinor / day),
    daysElapsed: day,
    topCategory: totals[0] ?? null,
  };
}
