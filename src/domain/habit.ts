import { addDays, diffDays } from './dates';
import type { ISODate, Transaction } from './types';

/**
 * Logging habit, built to be kind (lessons from Duolingo's streak research): a day counts when it has
 * an entry or was marked "no spend"; every 7 logged days earn a rest day (up to 2 saved) that keeps a run
 * going; today never breaks anything because the day is not over.
 */

export const CHECKIN_WINDOW = 7;
export const HABIT_WINDOW = 30;
export const REST_EVERY = 7;
export const REST_MAX = 2;

/** Days that count as logged: any entry, or marked as a day with no spending. */
export function loggedDays(
  transactions: readonly Pick<Transaction, 'date'>[],
  noSpend: readonly ISODate[],
): Set<ISODate> {
  const days = new Set<ISODate>(noSpend);
  for (const t of transactions) days.add(t.date);
  return days;
}

/** The first day Ledger was used: the earliest entry or no-spend mark. Null when there is neither. */
export function firstLoggedDay(days: ReadonlySet<ISODate>): ISODate | null {
  let first: ISODate | null = null;
  for (const d of days) if (first === null || d < first) first = d;
  return first;
}

/**
 * Days in the last week (never today, never before the first logged day) with nothing logged,
 * oldest first. These are what the check-in asks about.
 */
export function missedDays(
  days: ReadonlySet<ISODate>,
  today: ISODate,
  window: number = CHECKIN_WINDOW,
): ISODate[] {
  const first = firstLoggedDay(days);
  if (first === null) return [];
  const out: ISODate[] = [];
  for (let i = window; i >= 1; i -= 1) {
    const d = addDays(today, -i);
    if (d >= first && d < today && !days.has(d)) out.push(d);
  }
  return out;
}

export interface HabitSummary {
  /** Days in the last 30 that could have been logged (today only once it is logged). */
  windowDays: number;
  loggedInWindow: number;
  /** Logged days in the current run, rest days not counted. */
  run: number;
  /** Rest days the current run has used. */
  restUsed: number;
  /** Rest days saved for later, at most REST_MAX. */
  restSaved: number;
}

export function habitSummary(days: ReadonlySet<ISODate>, today: ISODate): HabitSummary | null {
  const first = firstLoggedDay(days);
  if (first === null || first > today) return null;
  const todayLogged = days.has(today);
  const last = todayLogged ? today : addDays(today, -1);

  let run = 0;
  let restUsed = 0;
  let restSaved = 0;
  let sinceEarned = 0;
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (days.has(d)) {
      run += 1;
      sinceEarned += 1;
      if (sinceEarned === REST_EVERY) {
        restSaved = Math.min(REST_MAX, restSaved + 1);
        sinceEarned = 0;
      }
    } else if (run > 0 && restSaved > 0) {
      restSaved -= 1;
      restUsed += 1;
    } else {
      run = 0;
      restUsed = 0;
      sinceEarned = 0;
    }
  }

  const windowStart = addDays(today, -(HABIT_WINDOW - 1));
  const from = first > windowStart ? first : windowStart;
  let windowDays = diffDays(today, from) + 1;
  if (!todayLogged) windowDays -= 1;
  let loggedInWindow = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) if (days.has(d)) loggedInWindow += 1;
  return { windowDays: Math.max(0, windowDays), loggedInWindow, run, restUsed, restSaved };
}
