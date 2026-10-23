import type { Flow } from './accounts';
import type { Category, ISODate, Transaction } from './types';

/**
 * 50/30/20 (Drop 12): needs, wants and what was left of the money in. Each category is a need or a
 * want; subcategories count with their category. Fees (card interest and charges) count as needs.
 */

export type NeedKind = 'need' | 'want';

const NEEDS = new Set(['housing', 'groceries', 'health', 'transport', 'education', 'business']);

export const needOf = (c: Pick<Category, 'id' | 'need'>): NeedKind =>
  c.need ?? (NEEDS.has(c.id) ? 'need' : 'want');

export const TARGETS = { needs: 50, wants: 30, left: 20 } as const;

export interface FiftyThirtyTwenty {
  inMinor: number;
  needsMinor: number;
  wantsMinor: number;
  /** Money in less needs and wants; null without money in. */
  leftMinor: number | null;
  /** Whole percent of the money in (or of spending, without money in). */
  pct: { needs: number; wants: number; left: number | null };
  /** What the percentages are of. */
  base: 'income' | 'spending';
}

export function fiftyThirtyTwenty(input: {
  transactions: readonly Pick<Transaction, 'date' | 'amountMinor' | 'categoryId'>[];
  flows: readonly Pick<Flow, 'kind' | 'date' | 'amountMinor'>[];
  categories: readonly Pick<Category, 'id' | 'need'>[];
  start: ISODate;
  end: ISODate;
}): FiftyThirtyTwenty {
  const within = (d: ISODate) => d >= input.start && d <= input.end;
  const kind = (id: string): NeedKind => {
    const c = input.categories.find((x) => x.id === id);
    return c ? needOf(c) : 'want';
  };
  let needsMinor = 0;
  let wantsMinor = 0;
  for (const t of input.transactions) {
    if (!within(t.date)) continue;
    if (kind(t.categoryId) === 'need') needsMinor += t.amountMinor;
    else wantsMinor += t.amountMinor;
  }
  let inMinor = 0;
  for (const f of input.flows) {
    if (!within(f.date)) continue;
    if (f.kind === 'income') inMinor += f.amountMinor;
    else if (f.kind === 'fee') needsMinor += f.amountMinor;
  }
  const pct = (part: number, of: number) => (of > 0 ? Math.round((part / of) * 100) : 0);
  if (inMinor > 0) {
    const leftMinor = inMinor - needsMinor - wantsMinor;
    return {
      inMinor,
      needsMinor,
      wantsMinor,
      leftMinor,
      pct: {
        needs: pct(needsMinor, inMinor),
        wants: pct(wantsMinor, inMinor),
        left: pct(leftMinor, inMinor),
      },
      base: 'income',
    };
  }
  const spent = needsMinor + wantsMinor;
  return {
    inMinor: 0,
    needsMinor,
    wantsMinor,
    leftMinor: null,
    pct: {
      needs: pct(needsMinor, spent),
      wants: spent > 0 ? 100 - pct(needsMinor, spent) : 0,
      left: null,
    },
    base: 'spending',
  };
}
