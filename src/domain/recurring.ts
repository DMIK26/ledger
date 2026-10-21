import { normalizeMerchantKey } from './categoriser';
import { addDays, daysInMonth, diffDays, isoFromYMD, parseISO, shiftMonth } from './dates';
import type { CategoryId, ISODate, PaymentMethod, Transaction } from './types';

export type Cadence = 'weekly' | 'monthly' | 'yearly';

/** A repeating payment the user has confirmed or added. */
export interface RecurringItem {
  id: string;
  merchant: string;
  categoryId: CategoryId;
  method: PaymentMethod;
  amountMinor: number;
  cadence: Cadence;
  /** Any one date it falls on; the rest follow from the cadence. */
  anchor: ISODate;
  createdAt: number;
}

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
};

const PER_YEAR: Record<Cadence, number> = { weekly: 52, monthly: 12, yearly: 1 };

export const yearlyCost = (item: Pick<RecurringItem, 'amountMinor' | 'cadence'>): number =>
  item.amountMinor * PER_YEAR[item.cadence];

/** The n-th occurrence after the anchor (n may be negative). Monthly dates keep their day, clamped. */
export function occurrence(anchor: ISODate, cadence: Cadence, n: number): ISODate {
  if (cadence === 'weekly') return addDays(anchor, 7 * n);
  const p = parseISO(anchor)!;
  const t = shiftMonth(p.y, p.m, cadence === 'monthly' ? n : 12 * n);
  return isoFromYMD(t.y, t.m, Math.min(p.d, daysInMonth(t.y, t.m)));
}

/** Dates the item falls on from `from` for `days` days. */
export function occurrencesBetween(
  item: Pick<RecurringItem, 'anchor' | 'cadence'>,
  from: ISODate,
  days: number,
): ISODate[] {
  const to = addDays(from, days - 1);
  // Start a little before `from` so a clamped monthly date is never skipped.
  const step = item.cadence === 'weekly' ? 7 : item.cadence === 'monthly' ? 30.44 : 365.25;
  let n = Math.floor(diffDays(from, item.anchor) / step) - 1;
  const out: ISODate[] = [];
  for (;;) {
    const d = occurrence(item.anchor, item.cadence, n);
    if (d > to) break;
    if (d >= from) out.push(d);
    n += 1;
  }
  return out;
}

export function nextOccurrence(
  item: Pick<RecurringItem, 'anchor' | 'cadence'>,
  today: ISODate,
): ISODate {
  return occurrencesBetween(item, today, 400)[0] ?? item.anchor;
}

export interface Candidate {
  key: string;
  merchant: string;
  categoryId: CategoryId;
  method: PaymentMethod;
  amountMinor: number;
  cadence: Cadence;
  lastDate: ISODate;
  count: number;
}

const WINDOWS: Array<[Cadence, number, number]> = [
  ['weekly', 6, 8],
  ['monthly', 27, 33],
  ['yearly', 355, 375],
];

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

/**
 * Finds payments that repeat: the same merchant at a steady weekly, monthly or yearly gap, with amounts
 * within 15% of each other, at least three times (twice for yearly), and still going (the last one
 * no more than one and a half gaps ago).
 */
export function detectRecurring(
  list: readonly Transaction[],
  today: ISODate,
  ignoreKeys: ReadonlySet<string> = new Set(),
): Candidate[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of list) {
    const key = normalizeMerchantKey(t.merchant);
    if (!key || ignoreKeys.has(key) || t.date > today) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: Candidate[] = [];
  for (const [key, txs] of groups) {
    // One entry per day: two coffees on one day are not two cycles.
    const byDay = [...new Map(txs.map((t) => [t.date, t])).values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (byDay.length < 2) continue;
    const gaps = byDay.slice(1).map((t, i) => diffDays(t.date, byDay[i]!.date));
    const gap = median(gaps);
    const window = WINDOWS.find(([, lo, hi]) => gap >= lo && gap <= hi);
    if (!window) continue;
    const [cadence, lo, hi] = window;
    if (byDay.length < (cadence === 'yearly' ? 2 : 3)) continue;
    if (gaps.some((g) => g < lo * 0.8 || g > hi * 1.25)) continue;
    const amounts = byDay.map((t) => t.amountMinor);
    const typical = median(amounts);
    if (amounts.some((a) => Math.abs(a - typical) > typical * 0.15)) continue;
    const last = byDay[byDay.length - 1]!;
    if (diffDays(today, last.date) > hi * 1.5) continue;
    out.push({
      key,
      merchant: last.merchant,
      categoryId: last.categoryId,
      method: last.method,
      amountMinor: typical,
      cadence,
      lastDate: last.date,
      count: byDay.length,
    });
  }
  return out.sort((a, b) => yearlyCost(b) - yearlyCost(a));
}
