import type { CategoryId, ISODate } from './types';

/**
 * When a category change teaches Ledger a merchant's category (Drop 11, after YNAB's August 2026 rule).
 * Only decided entries vote (a guess the user never confirmed does not count). The rule changes when
 * two of the merchant's last three decided entries agree on the new category; a merchant's very first
 * decision is learned straight away, as before.
 */
export function shouldLearn(input: {
  categoryId: CategoryId;
  /** The merchant's remembered category, if any. */
  rule: CategoryId | undefined;
  /** The merchant's decided entries after the change, the changed one included. */
  decided: ReadonlyArray<{ categoryId: CategoryId; date: ISODate; createdAt: number }>;
}): boolean {
  if (input.rule === input.categoryId) return false;
  const last = [...input.decided]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 3);
  if (last.length <= 1) return true;
  return last.filter((e) => e.categoryId === input.categoryId).length >= 2;
}
