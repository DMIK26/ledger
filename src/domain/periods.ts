import {
  addDays,
  daysInMonth,
  diffDays,
  fmtDate,
  fyOf,
  isoFromYMD,
  monthLabel,
  monthBounds,
  monthKey,
  MONTHS,
  parseISO,
  shiftMonth,
  shiftMonthKey,
} from './dates';
import type { ISODate } from './types';

export type PeriodKind = 'month' | 'quarter' | 'fy' | 'custom';

export interface Period {
  kind: PeriodKind;
  start: ISODate;
  end: ISODate;
  label: string;
}

const short = (m: number) => MONTHS[m - 1]!.slice(0, 3);

/** A month follows Settings > Month starts on; with a start day other than 1 it spans two months. */
function monthPeriod(key: string): Period {
  const { start, end } = monthBounds(key);
  return { kind: 'month', start, end, label: monthLabel(key) };
}

/** Quarters follow the financial year: with an April start, Q1 is April to June. */
function quarterPeriod(y: number, m: number, fyStart: number): Period {
  const index = Math.floor(((((m - fyStart) % 12) + 12) % 12) / 3);
  const first = shiftMonth(y, m, -(((((m - fyStart) % 12) + 12) % 12) % 3));
  const last = shiftMonth(first.y, first.m, 2);
  const start = isoFromYMD(first.y, first.m, 1);
  const end = isoFromYMD(last.y, last.m, daysInMonth(last.y, last.m));
  const fy = fyOf(start, fyStart).label;
  const span =
    first.y === last.y
      ? `${short(first.m)} to ${short(last.m)} ${last.y}`
      : `${short(first.m)} ${first.y} to ${short(last.m)} ${last.y}`;
  return { kind: 'quarter', start, end, label: `Q${index + 1} ${fy} (${span})` };
}

function fyPeriod(iso: ISODate, fyStart: number): Period {
  const fy = fyOf(iso, fyStart);
  return { kind: 'fy', start: fy.start, end: fy.end, label: fy.label };
}

/** The month, quarter or financial year containing `today`, moved by `offset` whole periods. */
export function periodFor(
  kind: Exclude<PeriodKind, 'custom'>,
  today: ISODate,
  fyStart = 4,
  offset = 0,
): Period {
  const p = parseISO(today)!;
  if (kind === 'month') return monthPeriod(shiftMonthKey(monthKey(today), offset));
  if (kind === 'quarter') {
    const t = shiftMonth(p.y, p.m, offset * 3);
    return quarterPeriod(t.y, t.m, fyStart);
  }
  const fy = fyOf(today, fyStart);
  return fyPeriod(isoFromYMD(fy.startYear + offset, fyStart, 1), fyStart);
}

export function customPeriod(start: ISODate, end: ISODate): Period {
  const [a, b] = start <= end ? [start, end] : [end, start];
  return { kind: 'custom', start: a, end: b, label: `${fmtDate(a)} to ${fmtDate(b)}` };
}

export const periodDays = (p: Pick<Period, 'start' | 'end'>): number =>
  diffDays(p.end, p.start) + 1;

/** The period just before: the previous month, quarter or year, or the same number of days before. */
export function previousPeriod(p: Period, fyStart = 4): Period {
  if (p.kind === 'custom') {
    const days = periodDays(p);
    return customPeriod(addDays(p.start, -days), addDays(p.start, -1));
  }
  return periodFor(p.kind, p.start, fyStart, -1);
}

function minusYear(iso: ISODate): ISODate {
  const p = parseISO(iso)!;
  return isoFromYMD(p.y - 1, p.m, Math.min(p.d, daysInMonth(p.y - 1, p.m)));
}

/** The same dates one year earlier (29 February becomes the 28th). */
export function sameLastYear(p: Period, fyStart = 4): Period {
  if (p.kind === 'custom') return customPeriod(minusYear(p.start), minusYear(p.end));
  return periodFor(p.kind, minusYear(p.start), fyStart, 0);
}

/**
 * While a period is still running, compare like with like: cut the comparison period to the same
 * number of days that have passed in this one. Returns the end date to use for each.
 */
export function toDate(
  p: Period,
  compare: Period,
  today: ISODate,
): { end: ISODate; compareEnd: ISODate; partial: boolean } {
  if (today >= p.end || today < p.start)
    return { end: p.end, compareEnd: compare.end, partial: false };
  const elapsed = diffDays(today, p.start);
  const compareEnd = addDays(compare.start, elapsed);
  return {
    end: today,
    compareEnd: compareEnd > compare.end ? compare.end : compareEnd,
    partial: true,
  };
}
