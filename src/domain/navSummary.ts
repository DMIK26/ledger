import { categoryTotals, inMonth } from './aggregates';
import { budgetsForMonth, budgetStatus } from './budgets';
import { addDays, monthKey } from './dates';
import { nextOccurrence, type RecurringItem } from './recurring';
import type { Budget, ISODate, Transaction } from './types';

/** Small numbers for the navigation badges and peek cards. */
export interface NavSummary {
  monthMinor: number;
  entries: number;
  /** Entries whose category was a guess, waiting for a decision. */
  unsure: number;
  /** Categories over their budget this month. */
  overCategories: number;
  /** Overall budget left (or negative when over), null without a budget. */
  budgetLeftMinor: number | null;
  /** Recurring payments due in the next seven days. */
  dueSoon: number;
  next: { merchant: string; date: ISODate; amountMinor: number } | null;
}

export function navSummary(
  list: readonly Transaction[],
  budgets: readonly Budget[],
  recurring: readonly RecurringItem[],
  today: ISODate,
): NavSummary {
  const month = monthKey(today);
  const current = inMonth(list, month).filter((t) => t.date <= today);
  const monthMinor = current.reduce((s, t) => s + t.amountMinor, 0);
  const b = budgetsForMonth(budgets, month);
  const spentBy = new Map(categoryTotals(current, month).map((c) => [c.categoryId, c.totalMinor]));
  const overCategories = Object.entries(b.categories).filter(
    ([id, amount]) => budgetStatus(spentBy.get(id) ?? 0, amount).kind === 'over',
  ).length;
  const upcoming = recurring
    .map((r) => ({ r, date: nextOccurrence(r, today) }))
    .filter((x) => x.date >= today && x.date <= addDays(today, 7))
    .sort((a, c) => a.date.localeCompare(c.date));
  const first = upcoming[0];
  return {
    monthMinor,
    entries: current.length,
    unsure: list.filter((t) => t.unsure).length,
    overCategories,
    budgetLeftMinor: b.overall !== null ? b.overall - monthMinor : null,
    dueSoon: upcoming.length,
    next: first
      ? { merchant: first.r.merchant, date: first.date, amountMinor: first.r.amountMinor }
      : null,
  };
}
