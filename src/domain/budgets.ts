import { previousMonth } from './aggregates';
import { daysInMonth, isoFromYMD, monthKey, parseISO, shiftMonth } from './dates';
import type { Budget, CategoryId, ISODate, Transaction } from './types';

/** Budgets move in steps of ₹500 (50,000 paise) when dragged or suggested. */
export const BUDGET_STEP = 50_000;

export const budgetId = (month: string, scope: Budget['scope']): string => `${month}|${scope}`;

export function snapToStep(minor: number, step: number = BUDGET_STEP): number {
  return Math.max(0, Math.round(minor / step) * step);
}

const ceilToStep = (minor: number, step: number = BUDGET_STEP): number =>
  minor <= 0 ? 0 : Math.ceil(minor / step) * step;

export interface MonthBudgets {
  overall: number | null;
  categories: Record<CategoryId, number>;
}

export function budgetsForMonth(list: readonly Budget[], month: string): MonthBudgets {
  const out: MonthBudgets = { overall: null, categories: {} };
  for (const b of list) {
    if (b.month !== month) continue;
    if (b.scope === 'overall') out.overall = b.amountMinor;
    else out.categories[b.scope] = b.amountMinor;
  }
  return out;
}

export const hasBudgets = (b: MonthBudgets): boolean =>
  b.overall !== null || Object.keys(b.categories).length > 0;

/** Builds the stored rows for a month; zero or missing amounts are not stored. */
export function toBudgetRows(month: string, b: MonthBudgets): Budget[] {
  const rows: Budget[] = [];
  if (b.overall !== null && b.overall > 0)
    rows.push({ id: budgetId(month, 'overall'), month, scope: 'overall', amountMinor: b.overall });
  for (const [scope, amountMinor] of Object.entries(b.categories)) {
    if (amountMinor > 0) rows.push({ id: budgetId(month, scope), month, scope, amountMinor });
  }
  return rows;
}

export interface BudgetStatus {
  kind: 'under' | 'near' | 'over';
  leftMinor: number;
  overMinor: number;
  /** spent / budget, 0 when there is no budget. */
  ratio: number;
}

/** "near" from 80% of the budget; "over" above it. */
export function budgetStatus(spentMinor: number, budgetMinor: number): BudgetStatus {
  const ratio = budgetMinor > 0 ? spentMinor / budgetMinor : 0;
  const kind = spentMinor > budgetMinor ? 'over' : ratio >= 0.8 ? 'near' : 'under';
  return {
    kind,
    ratio,
    leftMinor: Math.max(0, budgetMinor - spentMinor),
    overMinor: Math.max(0, spentMinor - budgetMinor),
  };
}

/** Days in today's month after today. */
export function daysLeft(today: ISODate): number {
  const p = parseISO(today)!;
  return daysInMonth(p.y, p.m) - p.d;
}

/** Month-end total if spending continues at this month's daily average so far. */
export function projectMonthEnd(spentMinor: number, today: ISODate): number {
  const p = parseISO(today)!;
  return Math.round((spentMinor / p.d) * daysInMonth(p.y, p.m));
}

/** Month-end total if from tomorrow on you spend `perDayMinor` each day. */
export function whatIfMonthEnd(spentMinor: number, today: ISODate, perDayMinor: number): number {
  return spentMinor + perDayMinor * daysLeft(today);
}

/**
 * Suggested budgets from the last three full months: each category's monthly average (months with
 * nothing count as zero), rounded up to ₹500. The overall suggestion is the rounded-up average total.
 */
export function suggestBudgets(list: readonly Transaction[], today: ISODate): MonthBudgets {
  const p = parseISO(today)!;
  const months = [1, 2, 3].map((i) => {
    const { y, m } = shiftMonth(p.y, p.m, -i);
    return isoFromYMD(y, m, 1).slice(0, 7);
  });
  const sums: Record<CategoryId, number> = {};
  let total = 0;
  for (const t of list) {
    if (!months.includes(monthKey(t.date))) continue;
    sums[t.categoryId] = (sums[t.categoryId] ?? 0) + t.amountMinor;
    total += t.amountMinor;
  }
  const categories: Record<CategoryId, number> = {};
  for (const [id, sum] of Object.entries(sums)) {
    const v = ceilToStep(sum / 3);
    if (v > 0) categories[id] = v;
  }
  // Category suggestions are each rounded up, so the overall one never sits below their sum.
  const catSum = Object.values(categories).reduce((a, b) => a + b, 0);
  return { overall: total > 0 ? Math.max(ceilToStep(total / 3), catSum) : null, categories };
}

/** Last month's budgets, ready to store under `month`. */
export function copyFromPreviousMonth(list: readonly Budget[], month: string): MonthBudgets {
  return budgetsForMonth(list, previousMonth(month));
}

export interface Segment {
  id: CategoryId;
  amountMinor: number;
}

/**
 * Moves budget across the divider after `index`: positive `delta` grows the left segment and shrinks the
 * right one. The total never changes and neither side goes below zero. Results are snapped to the step.
 */
export function moveAllocation(
  segments: readonly Segment[],
  index: number,
  delta: number,
  step: number = BUDGET_STEP,
): Segment[] {
  const left = segments[index];
  const right = segments[index + 1];
  if (!left || !right) return [...segments];
  const pair = left.amountMinor + right.amountMinor;
  const target = Math.min(pair, Math.max(0, snapToStep(left.amountMinor + delta, step)));
  return segments.map((s, i) =>
    i === index
      ? { ...s, amountMinor: target }
      : i === index + 1
        ? { ...s, amountMinor: pair - target }
        : s,
  );
}
