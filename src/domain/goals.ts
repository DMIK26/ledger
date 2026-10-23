import {
  addDays,
  diffDays,
  isoFromYMD,
  monthBounds,
  monthKey,
  parseISO,
  shiftMonthKey,
} from './dates';
import type { ISODate } from './types';
import type { Space } from './spaces';
import { tl } from './i18n';

/**
 * Goals and funds. A save-up goal is money you keep (a phone, a trip, an emergency fund); a fund is
 * money put aside for a known cost (insurance, school fees, Diwali) and is "paid" when that cost comes.
 * What is put aside is logged by you: it never moves account money and is never spending.
 */

export type GoalKind = 'goal' | 'fund';

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  get goal() {
    return tl('Save-up goal');
  },
  get fund() {
    return tl('Fund for a known cost');
  },
};

export interface Contribution {
  id: string;
  date: ISODate;
  /** Integer minor units, always positive. */
  amountMinor: number;
}

export interface Goal {
  id: string;
  /** The Shop ledger's rows say 'shop'; missing means Personal (Drop 13). */
  space?: Space;
  name: string;
  kind: GoalKind;
  targetMinor: number;
  /** When saving started: the plan spreads the target over the months from here to dueDate. */
  startDate: ISODate;
  dueDate: ISODate;
  contributions: Contribution[];
  /** Months ('YYYY-MM') skipped with "Snooze this month". */
  snoozed: string[];
  /** A fund that comes back every year (insurance, fees) starts again after it is paid. */
  yearly?: boolean;
  /** A fund marked paid (and not yearly). */
  paidOn?: ISODate;
  /** The last time a yearly fund was paid. */
  lastPaidOn?: ISODate;
  createdAt: number;
  updatedAt: number;
}

export type GoalState = 'paid' | 'done' | 'ahead' | 'on-track' | 'at-risk';

export const GOAL_STATE_LABEL: Record<GoalState, string> = {
  get paid() {
    return tl('Paid');
  },
  get done() {
    return tl('Reached');
  },
  get ahead() {
    return tl('Ahead');
  },
  get 'on-track'() {
    return tl('On track');
  },
  get 'at-risk'() {
    return tl('At risk');
  },
};

export const MAX_GOAL_NAME = 40;

const ceilRupee = (minor: number): number => (minor <= 0 ? 0 : Math.ceil(minor / 100) * 100);

export function savedMinor(goal: Pick<Goal, 'contributions'>, asOf?: ISODate): number {
  return goal.contributions
    .filter((c) => asOf === undefined || c.date <= asOf)
    .reduce((s, c) => s + c.amountMinor, 0);
}

/** Month keys from `from` to `to`, both included (empty when `to` is earlier). */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 1200; m = shiftMonthKey(m, 1)) out.push(m);
  return out;
}

/** Months the plan runs over (start month to due month), less snoozed ones; at least one. */
function planMonths(goal: Goal): string[] {
  const all = monthsBetween(monthKey(goal.startDate), monthKey(goal.dueDate));
  const kept = all.filter((m) => !goal.snoozed.includes(m));
  return kept.length > 0 ? kept : [monthKey(goal.dueDate)];
}

/**
 * What to put aside this month: what is still missing at the start of the month, shared over the
 * months left to the due date (snoozed months skipped), rounded up to the rupee. Nothing when this
 * month is snoozed, the target is reached or a fund is paid.
 */
export function monthlyNeed(goal: Goal, today: ISODate): number {
  if (goal.paidOn) return 0;
  const month = monthKey(today);
  if (goal.snoozed.includes(month)) return 0;
  const savedBefore = savedMinor(goal, addDays(monthBounds(month).start, -1));
  const missing = goal.targetMinor - savedBefore;
  if (missing <= 0 || savedMinor(goal) >= goal.targetMinor) return 0;
  const left = monthsBetween(month, monthKey(goal.dueDate)).filter(
    (m) => !goal.snoozed.includes(m),
  ).length;
  return ceilRupee(missing / Math.max(1, left));
}

/** Put aside this month so far. */
export function savedThisMonth(goal: Goal, today: ISODate): number {
  const month = monthKey(today);
  return goal.contributions
    .filter((c) => c.date <= today && monthKey(c.date) === month)
    .reduce((s, c) => s + c.amountMinor, 0);
}

/**
 * Against the plan (the target spread evenly over the plan's months): on track when what is put aside
 * covers every month already over, ahead when it also covers this month and half of the next, at risk
 * when it falls short or the date has passed.
 */
export function goalState(goal: Goal, today: ISODate): GoalState {
  if (goal.paidOn) return 'paid';
  const saved = savedMinor(goal);
  if (saved >= goal.targetMinor) return 'done';
  if (today > goal.dueDate) return 'at-risk';
  const months = planMonths(goal);
  const share = goal.targetMinor / months.length;
  const month = monthKey(today);
  const passed = months.filter((m) => m < month).length;
  const expectedNow = share * passed;
  const expectedEnd = share * (passed + (months.includes(month) ? 1 : 0));
  if (saved >= expectedEnd + share / 2) return 'ahead';
  return saved >= expectedNow ? 'on-track' : 'at-risk';
}

/** How full the jar is, 0 to 1. */
export const jarFill = (goal: Goal): number =>
  goal.targetMinor > 0 ? Math.min(1, savedMinor(goal) / goal.targetMinor) : 0;

/** The same day a year later (29 Feb becomes 28 Feb). */
export function nextYear(iso: ISODate): ISODate {
  const p = parseISO(iso)!;
  const d = p.m === 2 && p.d === 29 ? 28 : p.d;
  return isoFromYMD(p.y + 1, p.m, d);
}

/**
 * A fund marked paid. A yearly fund starts again: due a year after its due date, saving from today,
 * with anything put aside beyond the target kept as its first amount.
 */
export function payFund(goal: Goal, today: ISODate, newContributionId: string): Goal {
  if (!goal.yearly) return { ...goal, paidOn: today };
  const extra = savedMinor(goal) - goal.targetMinor;
  return {
    ...goal,
    startDate: today,
    dueDate: nextYear(goal.dueDate),
    contributions: extra > 0 ? [{ id: newContributionId, date: today, amountMinor: extra }] : [],
    snoozed: [],
    lastPaidOn: today,
    paidOn: undefined,
  };
}

/**
 * What goals take out of this month's spending money: for each goal, this month's need, or what was
 * actually put aside this month when that is more.
 */
export function goalsSetAside(goals: readonly Goal[], today: ISODate): number {
  return goals
    .filter((g) => !g.paidOn)
    .reduce((s, g) => s + Math.max(monthlyNeed(g, today), savedThisMonth(g, today)), 0);
}

/** Days until the due date (negative once it has passed). */
export const daysToDue = (goal: Goal, today: ISODate): number => diffDays(goal.dueDate, today);

/** Open goals first (soonest due first), then reached ones, then paid ones. */
export function sortGoals(goals: readonly Goal[], today: ISODate): Goal[] {
  const rank = (g: Goal) => {
    const s = goalState(g, today);
    return s === 'paid' ? 2 : s === 'done' ? 1 : 0;
  };
  return [...goals].sort(
    (a, b) => rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate) || a.createdAt - b.createdAt,
  );
}
