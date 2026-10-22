import type { Flow } from './accounts';
import { budgetId } from './budgets';
import { normalizeMerchantKey } from './categoriser';
import { addDays, diffDays, monthBounds, monthKey, monthProgress, shiftMonthKey } from './dates';
import { goalsSetAside, type Goal } from './goals';
import { occurrencesBetween, type RecurringItem } from './recurring';
import type { Budget, BudgetKind, Category, CategoryId, ISODate, Transaction } from './types';

/** Drop 10: planning ahead. Budget types, bills still to come, forecast, safe to spend, rollover. */

export const BUDGET_KINDS: readonly BudgetKind[] = ['fixed', 'flexible', 'non-monthly'];

export const BUDGET_KIND_LABEL: Record<BudgetKind, string> = {
  fixed: 'Fixed',
  flexible: 'Flexible',
  'non-monthly': 'Non-monthly',
};

export const BUDGET_KIND_HINT: Record<BudgetKind, string> = {
  fixed: 'About the same every month, like rent, bills and EMIs.',
  flexible: 'Day-to-day spending that changes with you.',
  'non-monthly': 'Comes now and then, like fees, insurance and gifts.',
};

const DEFAULT_KIND: Record<string, BudgetKind> = { housing: 'fixed', education: 'non-monthly' };

/** A category's budget type: what was chosen, else Housing fixed, Education non-monthly, the rest flexible. */
export function budgetKindOf(
  categoryId: CategoryId,
  categories: readonly Pick<Category, 'id' | 'budgetKind'>[],
): BudgetKind {
  return (
    categories.find((c) => c.id === categoryId)?.budgetKind ??
    DEFAULT_KIND[categoryId] ??
    'flexible'
  );
}

type Tx = Pick<Transaction, 'date' | 'amountMinor' | 'categoryId' | 'merchant' | 'recurringId'>;

const sum = (list: readonly { amountMinor: number }[]): number =>
  list.reduce((s, t) => s + t.amountMinor, 0);

const isFor = (t: Tx, item: RecurringItem, key: string): boolean =>
  t.recurringId === item.id || (key !== '' && normalizeMerchantKey(t.merchant) === key);

export interface Bill {
  item: RecurringItem;
  date: ISODate;
}

/**
 * Recurring payments still to come this month: due after today and by the month's last day. One already
 * logged early this month (same merchant) counts as paid, so it is never counted twice.
 */
export function billsLeft(
  recurring: readonly RecurringItem[],
  transactions: readonly Tx[],
  today: ISODate,
): Bill[] {
  const { start, end } = monthBounds(monthKey(today));
  if (today >= end) return [];
  const out: Bill[] = [];
  for (const item of recurring) {
    const all = occurrencesBetween(item, start, diffDays(end, start) + 1);
    const after = all.filter((d) => d > today);
    if (after.length === 0) continue;
    const key = normalizeMerchantKey(item.merchant);
    const logged = transactions.filter(
      (t) => t.date >= start && t.date <= end && isFor(t, item, key),
    ).length;
    const early = Math.max(0, logged - (all.length - after.length));
    for (const date of after.slice(early)) out.push({ item, date });
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.item.merchant.localeCompare(b.item.merchant),
  );
}

export interface Forecast {
  spentMinor: number;
  /** Entries already logged with a date later this month. */
  aheadMinor: number;
  /** Flexible spending per day so far (bills left out). */
  flexibleRateMinor: number;
  /** Flexible spending expected over the days left. */
  flexibleMoreMinor: number;
  billsMinor: number;
  totalMinor: number;
}

interface ForecastInput {
  transactions: readonly Tx[];
  categories: readonly Pick<Category, 'id' | 'budgetKind'>[];
  recurring: readonly RecurringItem[];
  today: ISODate;
  /** Only this category (for a category's forecast). */
  categoryId?: CategoryId;
}

/**
 * Where the month is heading: spending so far, plus flexible spending at its daily rate for the days
 * left, plus bills still to come. Fixed and non-monthly spending is not stretched over the month.
 */
export function forecastMonthEnd(input: ForecastInput): Forecast {
  const { today, categoryId } = input;
  const { start, end } = monthBounds(monthKey(today));
  const { day, length } = monthProgress(today);
  const mine = (t: Tx) => categoryId === undefined || t.categoryId === categoryId;
  const month = input.transactions.filter((t) => t.date >= start && t.date <= end && mine(t));
  const sofar = month.filter((t) => t.date <= today);
  const billKeys = new Set(input.recurring.map((r) => normalizeMerchantKey(r.merchant)));
  const flexible = sofar.filter(
    (t) =>
      !t.recurringId &&
      !billKeys.has(normalizeMerchantKey(t.merchant)) &&
      budgetKindOf(t.categoryId, input.categories) === 'flexible',
  );
  const flexibleRateMinor = Math.round(sum(flexible) / day);
  const flexibleMoreMinor = Math.round((sum(flexible) / day) * (length - day));
  const bills = billsLeft(
    input.recurring.filter((r) => categoryId === undefined || r.categoryId === categoryId),
    input.transactions,
    today,
  );
  const spentMinor = sum(sofar);
  const aheadMinor = sum(month) - spentMinor;
  const billsMinor = bills.reduce((s, b) => s + b.item.amountMinor, 0);
  return {
    spentMinor,
    aheadMinor,
    flexibleRateMinor,
    flexibleMoreMinor,
    billsMinor,
    totalMinor: spentMinor + aheadMinor + flexibleMoreMinor + billsMinor,
  };
}

/** Spending per month and category, for rollover and reviews. */
export function spendIndex(
  transactions: readonly Tx[],
): (month: string, categoryId?: CategoryId) => number {
  const map = new Map<string, number>();
  for (const t of transactions) {
    const m = monthKey(t.date);
    map.set(`${m}|${t.categoryId}`, (map.get(`${m}|${t.categoryId}`) ?? 0) + t.amountMinor);
    map.set(m, (map.get(m) ?? 0) + t.amountMinor);
  }
  return (month, categoryId) => map.get(categoryId ? `${month}|${categoryId}` : month) ?? 0;
}

export interface EffectiveBudget {
  baseMinor: number;
  /** Carried in from last month: positive when it was under budget, negative when over. */
  carryMinor: number;
  /** base + carry, never below zero. */
  totalMinor: number;
}

const MAX_CARRY_MONTHS = 12;

/**
 * A category's budget for a month. With rollover on, what was left (or what went over) last month
 * carries in, and so on back while each earlier month had a budget too (up to a year).
 */
export function effectiveBudget(
  budgets: readonly Budget[],
  spentIn: (month: string, categoryId?: CategoryId) => number,
  month: string,
  category: Pick<Category, 'id' | 'rollover'>,
): EffectiveBudget | null {
  const amounts = new Map(budgets.map((b) => [b.id, b.amountMinor]));
  const base = amounts.get(budgetId(month, category.id));
  if (base === undefined) return null;
  let carryMinor = 0;
  if (category.rollover) {
    // Walk back to the earliest month in the chain, then carry forward.
    const chain: string[] = [];
    for (
      let m = shiftMonthKey(month, -1);
      chain.length < MAX_CARRY_MONTHS;
      m = shiftMonthKey(m, -1)
    ) {
      if (!amounts.has(budgetId(m, category.id))) break;
      chain.unshift(m);
    }
    for (const m of chain)
      carryMinor = amounts.get(budgetId(m, category.id))! + carryMinor - spentIn(m, category.id);
  }
  return { baseMinor: base, carryMinor, totalMinor: Math.max(0, base + carryMinor) };
}

export interface SafeToSpend {
  source: 'budget' | 'income' | 'none';
  baseMinor: number;
  spentBeforeMinor: number;
  spentTodayMinor: number;
  /** Bills still to come this month and entries already logged for later days. */
  billsMinor: number;
  goalsMinor: number;
  /** base less spending before today, bills and goals; negative when the month is already over. */
  availableMinor: number;
  /** Days left including today. */
  daysLeft: number;
  /** available shared over the days left, rounded down to the rupee; 0 when nothing is left. */
  perDayMinor: number;
  /** perDay less what was spent today; negative when today went over. */
  todayLeftMinor: number;
}

export interface SafeToSpendInput {
  transactions: readonly Tx[];
  flows: readonly Pick<Flow, 'kind' | 'date' | 'amountMinor'>[];
  budgets: readonly Budget[];
  categories: readonly Pick<Category, 'id' | 'budgetKind' | 'rollover'>[];
  recurring: readonly RecurringItem[];
  goals: readonly Goal[];
  today: ISODate;
}

/**
 * What can be spent today and stay on plan: the month's budget (or, without one, the money in this
 * month) less spending before today, bills still to come and what goals need this month, shared over
 * the days left including today, less what was spent today. Underspending one day raises the next.
 */
export function safeToSpend(input: SafeToSpendInput): SafeToSpend {
  const { today } = input;
  const month = monthKey(today);
  const { start, end } = monthBounds(month);
  const spentIn = spendIndex(input.transactions);
  const overall = input.budgets.find((b) => b.id === budgetId(month, 'overall'))?.amountMinor;
  const catBudgets = input.categories
    .map((c) => effectiveBudget(input.budgets, spentIn, month, c))
    .filter((b): b is EffectiveBudget => b !== null);
  const income = input.flows
    .filter((f) => f.kind === 'income' && f.date >= start && f.date <= today)
    .reduce((s, f) => s + f.amountMinor, 0);
  const source: SafeToSpend['source'] =
    overall !== undefined || catBudgets.length > 0 ? 'budget' : income > 0 ? 'income' : 'none';
  const baseMinor =
    overall !== undefined
      ? overall
      : catBudgets.length > 0
        ? catBudgets.reduce((s, b) => s + b.totalMinor, 0)
        : income;
  const inMonth = input.transactions.filter((t) => t.date >= start && t.date <= end);
  const spentBeforeMinor = sum(inMonth.filter((t) => t.date < today));
  const spentTodayMinor = sum(inMonth.filter((t) => t.date === today));
  const aheadMinor = sum(inMonth.filter((t) => t.date > today));
  const billsMinor =
    aheadMinor +
    billsLeft(input.recurring, input.transactions, today).reduce(
      (s, b) => s + b.item.amountMinor,
      0,
    );
  const goalsMinor = goalsSetAside(input.goals, today);
  const availableMinor = baseMinor - spentBeforeMinor - billsMinor - goalsMinor;
  const daysLeft = diffDays(end, today) + 1;
  const perDayMinor = availableMinor > 0 ? Math.floor(availableMinor / daysLeft / 100) * 100 : 0;
  return {
    source,
    baseMinor,
    spentBeforeMinor,
    spentTodayMinor,
    billsMinor,
    goalsMinor,
    availableMinor,
    daysLeft,
    perDayMinor,
    todayLeftMinor: perDayMinor - spentTodayMinor,
  };
}

export interface PacePoint {
  date: ISODate;
  day: number;
  /** Spending added up to this day; null for days still to come. */
  actualMinor: number | null;
  /** A straight line from nothing on day one to the budget on the last day. */
  idealMinor: number;
}

/** Day-by-day spending for a month against a straight line to the budget. */
export function pacingSeries(
  transactions: readonly Tx[],
  month: string,
  budgetMinor: number,
  today: ISODate,
): PacePoint[] {
  const { start, end } = monthBounds(month);
  const length = diffDays(end, start) + 1;
  const byDay = new Map<ISODate, number>();
  for (const t of transactions)
    if (t.date >= start && t.date <= end)
      byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amountMinor);
  const out: PacePoint[] = [];
  let running = 0;
  for (let i = 0; i < length; i += 1) {
    const date = addDays(start, i);
    running += byDay.get(date) ?? 0;
    out.push({
      date,
      day: i + 1,
      actualMinor: date <= today ? running : null,
      idealMinor: Math.round((budgetMinor * (i + 1)) / length),
    });
  }
  return out;
}

export interface CategoryRisk {
  categoryId: CategoryId;
  spentMinor: number;
  budgetMinor: number;
  forecastMinor: number;
  kind: 'over' | 'at-risk';
}

/**
 * Categories over their budget, or heading over it at this rate. A forecast only counts from day 5,
 * or once half the budget is gone, so one big first day does not raise an alarm.
 */
export function categoriesAtRisk(input: {
  transactions: readonly Tx[];
  budgets: readonly Budget[];
  categories: readonly Pick<Category, 'id' | 'budgetKind' | 'rollover'>[];
  recurring: readonly RecurringItem[];
  today: ISODate;
}): CategoryRisk[] {
  const month = monthKey(input.today);
  const { day } = monthProgress(input.today);
  const allSpent = spendIndex(input.transactions);
  const spentIn = spendIndex(input.transactions.filter((t) => t.date <= input.today));
  const out: CategoryRisk[] = [];
  for (const c of input.categories) {
    const budget = effectiveBudget(input.budgets, allSpent, month, c);
    if (!budget || budget.totalMinor <= 0) continue;
    const spentMinor = spentIn(month, c.id);
    const forecastMinor = forecastMonthEnd({ ...input, categoryId: c.id }).totalMinor;
    if (spentMinor > budget.totalMinor)
      out.push({
        categoryId: c.id,
        spentMinor,
        budgetMinor: budget.totalMinor,
        forecastMinor,
        kind: 'over',
      });
    else if (forecastMinor > budget.totalMinor && (day >= 5 || spentMinor * 2 >= budget.totalMinor))
      out.push({
        categoryId: c.id,
        spentMinor,
        budgetMinor: budget.totalMinor,
        forecastMinor,
        kind: 'at-risk',
      });
  }
  const order = { over: 0, 'at-risk': 1 } as const;
  return out.sort(
    (a, b) =>
      order[a.kind] - order[b.kind] ||
      b.forecastMinor - b.budgetMinor - (a.forecastMinor - a.budgetMinor),
  );
}

/** The month to close: last month, in the first 7 days of this one, if it had entries and is not closed. */
export function monthToClose(
  todayIso: ISODate,
  closed: readonly string[],
  transactions: readonly Pick<Transaction, 'date'>[],
): string | null {
  if (monthProgress(todayIso).day > 7) return null;
  const prev = shiftMonthKey(monthKey(todayIso), -1);
  if (closed.includes(prev)) return null;
  const { start, end } = monthBounds(prev);
  return transactions.some((t) => t.date >= start && t.date <= end) ? prev : null;
}

export interface MonthReview {
  month: string;
  spentMinor: number;
  entries: number;
  budgetMinor: number | null;
  inMinor: number;
  /** Spending plus interest and fees. */
  outMinor: number;
  top: { categoryId: CategoryId; totalMinor: number } | null;
  /** Against the month before, in whole percent; null without one. */
  changePct: number | null;
  /** What carries into next month from categories with rollover on. */
  carriedMinor: number;
}

export function monthReview(input: {
  transactions: readonly Tx[];
  flows: readonly Pick<Flow, 'kind' | 'date' | 'amountMinor'>[];
  budgets: readonly Budget[];
  categories: readonly Pick<Category, 'id' | 'rollover'>[];
  month: string;
}): MonthReview {
  const { month } = input;
  const { start, end } = monthBounds(month);
  const list = input.transactions.filter((t) => t.date >= start && t.date <= end);
  const spentIn = spendIndex(input.transactions);
  const spentMinor = sum(list);
  const totals = new Map<CategoryId, number>();
  for (const t of list) totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amountMinor);
  const topEntry = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  let inMinor = 0;
  let feesMinor = 0;
  for (const f of input.flows) {
    if (f.date < start || f.date > end) continue;
    if (f.kind === 'income') inMinor += f.amountMinor;
    else if (f.kind === 'fee') feesMinor += f.amountMinor;
  }
  const before = spentIn(shiftMonthKey(month, -1));
  return {
    month,
    spentMinor,
    entries: list.length,
    budgetMinor:
      input.budgets.find((b) => b.id === budgetId(month, 'overall'))?.amountMinor ?? null,
    inMinor,
    outMinor: spentMinor + feesMinor,
    top: topEntry ? { categoryId: topEntry[0], totalMinor: topEntry[1] } : null,
    changePct: before > 0 ? Math.round(((spentMinor - before) / before) * 100) : null,
    carriedMinor: carriedFrom(input.budgets, spentIn, month, input.categories),
  };
}

/** What carries out of `month` into the next: for each rollover category, its budget less its spending. */
function carriedFrom(
  budgets: readonly Budget[],
  spentIn: (month: string, categoryId?: CategoryId) => number,
  month: string,
  categories: readonly Pick<Category, 'id' | 'rollover'>[],
): number {
  let total = 0;
  for (const c of categories) {
    if (!c.rollover) continue;
    const b = effectiveBudget(budgets, spentIn, month, c);
    if (b) total += b.baseMinor + b.carryMinor - spentIn(month, c.id);
  }
  return total;
}
