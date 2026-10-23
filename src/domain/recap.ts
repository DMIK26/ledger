import type { Flow } from './accounts';
import { normalizeMerchantKey } from './categoriser';
import {
  addDays,
  diffDays,
  fmtDate,
  fyOf,
  monthBounds,
  monthKey,
  monthLabel,
  monthProgress,
  shiftMonthKey,
} from './dates';
import { weekStart } from './calendar';
import type { CategoryId, ISODate, Transaction } from './types';
import { tl } from './i18n';

/**
 * Story recaps (Drop 11, after Spotify Wrapped, minus the nagging): last week, last month and the last
 * financial year in a few cards. Each recap is offered once on the Dashboard; `id` remembers it.
 */

export type RecapKind = 'week' | 'month' | 'fy';

export interface RecapPeriod {
  kind: RecapKind;
  /** 'week:2026-10-12', 'month:2026-10' or 'fy:2025'. */
  id: string;
  start: ISODate;
  end: ISODate;
  label: string;
  /** The period before, for the change. */
  compareStart: ISODate;
  compareEnd: ISODate;
}

export function lastWeek(today: ISODate): RecapPeriod {
  const start = addDays(weekStart(today), -7);
  const end = addDays(start, 6);
  return {
    kind: 'week',
    id: `week:${start}`,
    start,
    end,
    label: tl('Week of {0}', fmtDate(start)),
    compareStart: addDays(start, -7),
    compareEnd: addDays(start, -1),
  };
}

export const lastMonth = (today: ISODate): RecapPeriod =>
  monthRecap(shiftMonthKey(monthKey(today), -1));

/** Any month as a recap (Reports opens the month on screen). */
export function monthRecap(key: string): RecapPeriod {
  const { start, end } = monthBounds(key);
  const before = monthBounds(shiftMonthKey(key, -1));
  return {
    kind: 'month',
    id: `month:${key}`,
    start,
    end,
    label: monthLabel(key),
    compareStart: before.start,
    compareEnd: before.end,
  };
}

export function lastFinancialYear(today: ISODate, fyStart: number): RecapPeriod {
  const now = fyOf(today, fyStart);
  const fy = fyOf(addDays(now.start, -1), fyStart);
  const before = fyOf(addDays(fy.start, -1), fyStart);
  return {
    kind: 'fy',
    id: `fy:${fy.startYear}`,
    start: fy.start,
    end: fy.end,
    label: fy.label,
    compareStart: before.start,
    compareEnd: before.end,
  };
}

/**
 * The recap the Dashboard offers now, if any: the financial year in its first 30 days, else last month
 * in the first 7 days of a month, else last week from Monday to Wednesday. Only one with entries that
 * has not been seen.
 */
export function dueRecap(
  today: ISODate,
  seen: readonly string[],
  transactions: readonly Pick<Transaction, 'date'>[],
  fyStart: number,
): RecapPeriod | null {
  const has = (p: RecapPeriod) => transactions.some((t) => t.date >= p.start && t.date <= p.end);
  const candidates: RecapPeriod[] = [];
  if (diffDays(today, fyOf(today, fyStart).start) < 30)
    candidates.push(lastFinancialYear(today, fyStart));
  if (monthProgress(today).day <= 7) candidates.push(lastMonth(today));
  if (diffDays(today, weekStart(today)) <= 2) candidates.push(lastWeek(today));
  return candidates.find((p) => !seen.includes(p.id) && has(p)) ?? null;
}

export interface Recap {
  period: RecapPeriod;
  totalMinor: number;
  compareMinor: number;
  /** Whole percent against the period before; null without one. */
  changePct: number | null;
  entries: number;
  topCategory: { categoryId: CategoryId; totalMinor: number; share: number } | null;
  topMerchant: { name: string; totalMinor: number; count: number } | null;
  busiestDay: { date: ISODate; totalMinor: number } | null;
  /** Days in the period (up to today) with nothing spent. */
  quietDays: number;
  biggest: { merchant: string; amountMinor: number; date: ISODate } | null;
  inMinor: number;
  /** Money in less spending and fees; null when there was no money in. */
  leftMinor: number | null;
}

export function buildRecap(
  period: RecapPeriod,
  transactions: readonly Pick<Transaction, 'date' | 'amountMinor' | 'categoryId' | 'merchant'>[],
  flows: readonly Pick<Flow, 'kind' | 'date' | 'amountMinor'>[],
  today: ISODate,
): Recap {
  const inP = transactions.filter((t) => t.date >= period.start && t.date <= period.end);
  const before = transactions.filter(
    (t) => t.date >= period.compareStart && t.date <= period.compareEnd,
  );
  const sum = (l: readonly { amountMinor: number }[]) => l.reduce((s, t) => s + t.amountMinor, 0);
  const totalMinor = sum(inP);
  const compareMinor = sum(before);

  const cats = new Map<CategoryId, number>();
  const merchants = new Map<string, { name: string; total: number; count: number }>();
  const days = new Map<ISODate, number>();
  for (const t of inP) {
    cats.set(t.categoryId, (cats.get(t.categoryId) ?? 0) + t.amountMinor);
    const key = normalizeMerchantKey(t.merchant) || 'untitled';
    const m = merchants.get(key) ?? { name: t.merchant || tl('Untitled'), total: 0, count: 0 };
    m.total += t.amountMinor;
    m.count += 1;
    merchants.set(key, m);
    days.set(t.date, (days.get(t.date) ?? 0) + t.amountMinor);
  }
  const topCat = [...cats].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const topM = [...merchants.values()].sort((a, b) => b.total - a.total || b.count - a.count)[0];
  const busy = [...days].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const big = [...inP].sort(
    (a, b) => b.amountMinor - a.amountMinor || a.date.localeCompare(b.date),
  )[0];
  const last = period.end < today ? period.end : today;
  const span = last >= period.start ? diffDays(last, period.start) + 1 : 0;
  const quietDays = Math.max(0, span - [...days.keys()].filter((d) => d <= last).length);

  let inMinor = 0;
  let fees = 0;
  for (const f of flows) {
    if (f.date < period.start || f.date > period.end) continue;
    if (f.kind === 'income') inMinor += f.amountMinor;
    else if (f.kind === 'fee') fees += f.amountMinor;
  }
  return {
    period,
    totalMinor,
    compareMinor,
    changePct:
      compareMinor > 0 ? Math.round(((totalMinor - compareMinor) / compareMinor) * 100) : null,
    entries: inP.length,
    topCategory: topCat
      ? {
          categoryId: topCat[0],
          totalMinor: topCat[1],
          share: totalMinor ? topCat[1] / totalMinor : 0,
        }
      : null,
    topMerchant: topM ? { name: topM.name, totalMinor: topM.total, count: topM.count } : null,
    busiestDay: busy ? { date: busy[0], totalMinor: busy[1] } : null,
    quietDays,
    biggest: big
      ? { merchant: big.merchant || tl('Untitled'), amountMinor: big.amountMinor, date: big.date }
      : null,
    inMinor,
    leftMinor: inMinor > 0 ? inMinor - totalMinor - fees : null,
  };
}

export interface GuessResult {
  diffMinor: number;
  /** How far off, as a whole percent of the real figure. */
  offPct: number;
  verdict: 'spot-on' | 'close' | 'under' | 'over';
}

/** Spot on within 2%, close within 10%, otherwise the guess was under or over. */
export function guessResult(guessMinor: number, actualMinor: number): GuessResult {
  const diffMinor = guessMinor - actualMinor;
  const offPct = actualMinor > 0 ? Math.round((Math.abs(diffMinor) / actualMinor) * 100) : 0;
  const verdict =
    offPct <= 2 ? 'spot-on' : offPct <= 10 ? 'close' : diffMinor < 0 ? 'under' : 'over';
  return { diffMinor, offPct, verdict };
}

/** The slider range for a guess: up to twice the bigger of the real figure and the period before. */
export function guessMax(actualMinor: number, compareMinor: number): number {
  const top = Math.max(actualMinor, compareMinor, 100_000) * 2;
  return Math.ceil(top / 50_000) * 50_000;
}
