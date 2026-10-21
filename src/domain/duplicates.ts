import { normalizeMerchantKey } from './categoriser';
import { diffDays } from './dates';
import type { ISODate, Transaction } from './types';

export interface DuplicateCandidate {
  date: ISODate;
  amountMinor: number;
  merchant: string;
}

/**
 * An existing entry that looks like the same expense: same amount, same merchant (ignoring case and
 * punctuation), dated within one day. Returns the closest match, or null.
 */
export function findDuplicate(
  c: DuplicateCandidate,
  list: readonly Transaction[],
  ignoreId?: string,
): Transaction | null {
  const key = normalizeMerchantKey(c.merchant);
  if (!key) return null;
  let best: Transaction | null = null;
  let bestGap = Infinity;
  for (const t of list) {
    if (t.id === ignoreId || t.amountMinor !== c.amountMinor) continue;
    if (normalizeMerchantKey(t.merchant) !== key) continue;
    const gap = Math.abs(diffDays(t.date, c.date));
    if (gap <= 1 && gap < bestGap) {
      best = t;
      bestGap = gap;
    }
  }
  return best;
}
