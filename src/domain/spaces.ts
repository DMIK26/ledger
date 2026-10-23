import { monthBounds, monthKey, shiftMonthKey } from './dates';
import type { CategoryId, ISODate } from './types';

/**
 * Spaces (Drop 13): a Shop ledger beside the personal one. Every row that belongs to a ledger carries
 * `space: 'shop'`, or nothing for Personal, so data from before Drop 13 is all Personal.
 */

export type Space = 'personal' | 'shop';
/** What the switcher shows: one space, or both together for reading. */
export type SpaceView = Space | 'both';

export const spaceOf = (row: { space?: Space }): Space => row.space ?? 'personal';

export const inSpace = (row: { space?: Space }, view: SpaceView): boolean =>
  view === 'both' || spaceOf(row) === view;

export interface ProfitAndLossMonth {
  month: string;
  salesMinor: number;
  spentMinor: number;
  feesMinor: number;
  profitMinor: number;
}

export interface ProfitAndLoss {
  /** Money in: sales, for a shop. */
  salesMinor: number;
  spentMinor: number;
  /** Card interest and charges. */
  feesMinor: number;
  profitMinor: number;
  /** Profit as a whole percent of sales; null without sales. */
  marginPct: number | null;
  byCategory: Array<{ categoryId: CategoryId; totalMinor: number }>;
  /** One row per month when the range covers more than one. */
  months: ProfitAndLossMonth[];
}

/** Sales less spending and fees for a range, with a row per month for longer ranges. */
export function profitAndLoss(input: {
  transactions: readonly { date: ISODate; amountMinor: number; categoryId: CategoryId }[];
  flows: readonly { kind: string; date: ISODate; amountMinor: number }[];
  start: ISODate;
  end: ISODate;
}): ProfitAndLoss {
  const { start, end } = input;
  const sum = (from: ISODate, to: ISODate) => {
    let sales = 0;
    let fees = 0;
    let spent = 0;
    for (const f of input.flows) {
      if (f.date < from || f.date > to) continue;
      if (f.kind === 'income') sales += f.amountMinor;
      else if (f.kind === 'fee') fees += f.amountMinor;
    }
    for (const t of input.transactions) if (t.date >= from && t.date <= to) spent += t.amountMinor;
    return { sales, fees, spent };
  };
  const all = sum(start, end);
  const byCat = new Map<CategoryId, number>();
  for (const t of input.transactions)
    if (t.date >= start && t.date <= end)
      byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountMinor);
  const months: ProfitAndLossMonth[] = [];
  if (monthKey(start) !== monthKey(end)) {
    for (let m = monthKey(start); m <= monthKey(end); m = shiftMonthKey(m, 1)) {
      const b = monthBounds(m);
      const s = sum(b.start < start ? start : b.start, b.end > end ? end : b.end);
      months.push({
        month: m,
        salesMinor: s.sales,
        spentMinor: s.spent,
        feesMinor: s.fees,
        profitMinor: s.sales - s.spent - s.fees,
      });
    }
  }
  const profitMinor = all.sales - all.spent - all.fees;
  return {
    salesMinor: all.sales,
    spentMinor: all.spent,
    feesMinor: all.fees,
    profitMinor,
    marginPct: all.sales > 0 ? Math.round((profitMinor / all.sales) * 100) : null,
    byCategory: [...byCat.entries()]
      .map(([categoryId, totalMinor]) => ({ categoryId, totalMinor }))
      .sort((a, b) => b.totalMinor - a.totalMinor),
    months,
  };
}

/** Whether any list in a backup's data has a row from the Shop ledger. */
export const hasShopRows = (data: object): boolean =>
  Object.values(data).some(
    (list) =>
      Array.isArray(list) &&
      list.some(
        (row) =>
          typeof row === 'object' && row !== null && (row as { space?: unknown }).space === 'shop',
      ),
  );
