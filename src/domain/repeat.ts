import { normalizeMerchantKey } from './categoriser';
import { addDays } from './dates';
import type { CategoryId, ISODate, PaymentMethod, Transaction } from './types';

/** An entry saved for one-tap repeating (like Money Manager's payment profiles). */
export interface Favourite {
  id: string;
  merchant: string;
  amountMinor: number;
  categoryId: CategoryId;
  method: PaymentMethod;
  tags: string[];
  createdAt: number;
}

/** What a repeat chip adds: a pinned favourite or something logged often. */
export interface RepeatItem {
  key: string;
  merchant: string;
  amountMinor: number;
  categoryId: CategoryId;
  method: PaymentMethod;
  tags: string[];
  favouriteId?: string;
  /** How often it was logged in the window (frequent items only). */
  count?: number;
}

export const REPEAT_LIMIT = 6;
export const FREQUENT_DAYS = 90;
export const FREQUENT_MIN = 3;
export const MAX_FAVOURITES = 12;

export const repeatKey = (x: {
  merchant: string;
  amountMinor: number;
  categoryId: CategoryId;
  method: PaymentMethod;
}): string =>
  `${normalizeMerchantKey(x.merchant) || x.merchant}|${x.amountMinor}|${x.categoryId}|${x.method}`;

/**
 * Entries logged at least three times in the last 90 days with the same merchant, amount, category and
 * method, most frequent first (ties: most recent first). Spelling and tags come from the latest one.
 */
export function frequentEntries(
  transactions: readonly Transaction[],
  today: ISODate,
  { days = FREQUENT_DAYS, min = FREQUENT_MIN }: { days?: number; min?: number } = {},
): RepeatItem[] {
  const from = addDays(today, -days);
  const groups = new Map<string, { latest: Transaction; count: number }>();
  for (const t of transactions) {
    if (t.date < from || t.date > today) continue;
    const key = repeatKey(t);
    const g = groups.get(key);
    if (!g) groups.set(key, { latest: t, count: 1 });
    else {
      g.count += 1;
      if (t.date > g.latest.date || (t.date === g.latest.date && t.createdAt > g.latest.createdAt))
        g.latest = t;
    }
  }
  return [...groups.entries()]
    .filter(([, g]) => g.count >= min)
    .sort(
      ([, a], [, b]) =>
        b.count - a.count ||
        b.latest.date.localeCompare(a.latest.date) ||
        b.latest.createdAt - a.latest.createdAt,
    )
    .map(([key, g]) => ({
      key,
      merchant: g.latest.merchant,
      amountMinor: g.latest.amountMinor,
      categoryId: g.latest.categoryId,
      method: g.latest.method,
      tags: [...g.latest.tags],
      count: g.count,
    }));
}

export const favouriteToItem = (f: Favourite): RepeatItem => ({
  key: repeatKey(f),
  merchant: f.merchant,
  amountMinor: f.amountMinor,
  categoryId: f.categoryId,
  method: f.method,
  tags: [...f.tags],
  favouriteId: f.id,
});

/** The chips under quick add: favourites in their order, then frequent entries not already pinned. */
export function repeatChips(
  favourites: readonly Favourite[],
  transactions: readonly Transaction[],
  today: ISODate,
  limit: number = REPEAT_LIMIT,
): RepeatItem[] {
  const pinned = favourites.map(favouriteToItem);
  const keys = new Set(pinned.map((p) => p.key));
  const frequent = frequentEntries(transactions, today).filter((f) => !keys.has(f.key));
  return [...pinned, ...frequent].slice(0, limit);
}
