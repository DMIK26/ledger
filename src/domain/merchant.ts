import { normalizeMerchantKey } from './categoriser';
import { diffDays, monthBounds, monthKey, shiftMonthKey } from './dates';
import type { CategoryId, ISODate, PaymentMethod, Transaction } from './types';

/** A merchant's page (Drop 12): its whole history with a few plain facts, after Apple Card. */

export interface MerchantStats {
  key: string;
  /** The name as last written. */
  name: string;
  count: number;
  totalMinor: number;
  averageMinor: number;
  thisMonthMinor: number;
  first: ISODate;
  last: ISODate;
  daysSinceLast: number;
  /** Average days between visits, with three or more visits on different days; else null. */
  everyDays: number | null;
  usualCategoryId: CategoryId;
  usualMethod: PaymentMethod;
  /** The last 12 months, oldest first ('YYYY-MM'). */
  months: Array<{ month: string; totalMinor: number }>;
  /** Newest first. */
  entries: Transaction[];
}

const mostCommon = <T extends string>(values: readonly T[]): T => {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
};

export function merchantStats(
  key: string,
  transactions: readonly Transaction[],
  today: ISODate,
): MerchantStats | null {
  const entries = transactions
    .filter((t) => (normalizeMerchantKey(t.merchant) || 'untitled') === key)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  if (entries.length === 0) return null;
  const totalMinor = entries.reduce((s, t) => s + t.amountMinor, 0);
  const first = entries[entries.length - 1]!.date;
  const last = entries[0]!.date;
  const days = [...new Set(entries.map((t) => t.date))].sort();
  const everyDays =
    days.length >= 3
      ? Math.round(diffDays(days[days.length - 1]!, days[0]!) / (days.length - 1))
      : null;
  const now = monthKey(today);
  const { start, end } = monthBounds(now);
  const months = Array.from({ length: 12 }, (_, i) => shiftMonthKey(now, i - 11)).map((month) => {
    const b = monthBounds(month);
    return {
      month,
      totalMinor: entries
        .filter((t) => t.date >= b.start && t.date <= b.end)
        .reduce((s, t) => s + t.amountMinor, 0),
    };
  });
  return {
    key,
    name: entries[0]!.merchant || 'Untitled',
    count: entries.length,
    totalMinor,
    averageMinor: Math.round(totalMinor / entries.length),
    thisMonthMinor: entries
      .filter((t) => t.date >= start && t.date <= end)
      .reduce((s, t) => s + t.amountMinor, 0),
    first,
    last,
    daysSinceLast: Math.max(0, diffDays(today, last)),
    everyDays,
    usualCategoryId: mostCommon(entries.map((t) => t.categoryId)),
    usualMethod: mostCommon(entries.map((t) => t.method)),
    months,
    entries,
  };
}
