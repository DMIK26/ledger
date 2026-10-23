import { msg, tl } from './i18n';
import type { ISODate } from './types';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

// The names as shown, in the interface language (Drop 13). MONTHS and WEEKDAYS stay English for
// reading typed dates and for files.
const MONTH_SHORT = [
  msg('Jan'), msg('Feb'), msg('Mar'), msg('Apr'), msg('May'), msg('Jun'),
  msg('Jul'), msg('Aug'), msg('Sep'), msg('Oct'), msg('Nov'), msg('Dec'),
];
const MONTH_LONG = [
  msg('January'), msg('February'), msg('March'), msg('April'), msg('May'), msg('June'),
  msg('July'), msg('August'), msg('September'), msg('October'), msg('November'), msg('December'),
];
const DAY_SHORT = [msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')];
const DAY_LONG = [
  msg('Sunday'), msg('Monday'), msg('Tuesday'), msg('Wednesday'), msg('Thursday'), msg('Friday'),
  msg('Saturday'),
];
/** "October", "అక్టోబర్", "अक्टूबर"; m is 1 to 12. */
export const monthName = (m: number): string => tl(MONTH_LONG[m - 1] ?? '');
/** "Oct"; m is 1 to 12. */
export const monthShort = (m: number): string => tl(MONTH_SHORT[m - 1] ?? '');
/** "Thursday"; d is 0 (Sunday) to 6. */
export const dayName = (d: number): string => tl(DAY_LONG[d] ?? '');
/** "Thu"; d is 0 (Sunday) to 6. */
export const dayShort = (d: number): string => tl(DAY_SHORT[d] ?? '');

const pad2 = (n: number) => String(n).padStart(2, '0');
const MS_PER_DAY = 86_400_000;

/** Days in month `m` (1-12) of year `y`. */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidYMD(y: number, m: number, d: number): boolean {
  return (
    Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d) &&
    m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
  );
}

export function isoFromYMD(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

export function parseISO(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return isValidYMD(y, m, d) ? { y, m, d } : null;
}

function mustParse(iso: string): { y: number; m: number; d: number } {
  const p = parseISO(iso);
  if (!p) throw new Error(`Invalid ISO date: ${iso}`);
  return p;
}

/** Today's date in the device's own time zone. Never uses toISOString (that is UTC). */
export function todayISO(now: Date = new Date()): ISODate {
  return isoFromYMD(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(iso: ISODate, n: number): ISODate {
  const p = mustParse(iso);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return isoFromYMD(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from `b` to `a` (a - b). */
export function diffDays(a: ISODate, b: ISODate): number {
  const pa = mustParse(a);
  const pb = mustParse(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / MS_PER_DAY);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(iso: ISODate): number {
  const p = mustParse(iso);
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

/**
 * The day a "month" starts on, for people paid on a fixed day (Settings > Month starts on). 1 means
 * calendar months. Set once from settings, like privacy in money.ts, so every month calculation agrees.
 */
let monthStartDay = 1;
export const MAX_MONTH_START = 28;

export function setMonthStartDay(day: number): void {
  monthStartDay = Number.isInteger(day) ? Math.min(MAX_MONTH_START, Math.max(1, day)) : 1;
}
export const getMonthStartDay = (): number => monthStartDay;

const keyOf = (y: number, m: number): string => `${String(y).padStart(4, '0')}-${pad2(m)}`;

/**
 * The month a date belongs to, as 'YYYY-MM'. With a start day of 1 that is the calendar month. Otherwise
 * a month runs from the start day to the day before it next month, and is named after the month it
 * starts in when the start day is 1 to 15, or the month it ends in when it is 16 to 28 (salary on the
 * 25th of October pays for "November").
 */
export function monthKey(iso: ISODate): string {
  if (monthStartDay === 1) return iso.slice(0, 7);
  const p = parseISO(iso);
  if (!p) return iso.slice(0, 7);
  const begins = p.d >= monthStartDay ? { y: p.y, m: p.m } : shiftMonth(p.y, p.m, -1);
  const named = monthStartDay <= 15 ? begins : shiftMonth(begins.y, begins.m, 1);
  return keyOf(named.y, named.m);
}

/** Moves a 'YYYY-MM' month key by whole months. */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const s = shiftMonth(y ?? 2000, m ?? 1, delta);
  return keyOf(s.y, s.m);
}

/** First and last day of a month, following the month start day. */
export function monthBounds(key: string): { start: ISODate; end: ISODate } {
  const [y = 2000, m = 1] = key.split('-').map(Number);
  if (monthStartDay === 1) return { start: isoFromYMD(y, m, 1), end: isoFromYMD(y, m, daysInMonth(y, m)) };
  const begins = monthStartDay <= 15 ? { y, m } : shiftMonth(y, m, -1);
  const next = shiftMonth(begins.y, begins.m, 1);
  return {
    start: isoFromYMD(begins.y, begins.m, monthStartDay),
    end: addDays(isoFromYMD(next.y, next.m, monthStartDay), -1),
  };
}

/** Day number within its month (1 on the start day) and how many days that month has. */
export function monthProgress(iso: ISODate): { day: number; length: number } {
  const { start, end } = monthBounds(monthKey(iso));
  return { day: diffDays(iso, start) + 1, length: diffDays(end, start) + 1 };
}

/** "25 Oct to 24 Nov" when months do not start on the 1st; empty otherwise. */
export function monthRangeLabel(key: string): string {
  if (monthStartDay === 1) return '';
  const { start, end } = monthBounds(key);
  const a = mustParse(start);
  const b = mustParse(end);
  return tl('{0} to {1}', `${a.d} ${monthShort(a.m)}`, `${b.d} ${monthShort(b.m)}`);
}

export function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const index = y * 12 + (m - 1) + delta;
  return { y: Math.floor(index / 12), m: ((index % 12) + 12) % 12 + 1 };
}

export function fmtDate(iso: ISODate): string {
  const p = mustParse(iso);
  return `${p.d} ${monthShort(p.m)} ${p.y}`;
}

/** "Oct" for a month key, in the interface language (never a cut-off word in Telugu or Hindi). */
export function monthShortLabel(key: string): string {
  return monthShort(Number(key.split('-')[1]) || 1);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${monthName(m ?? 1)} ${y}`;
}

export interface FinancialYear {
  label: string;
  startYear: number;
  start: ISODate;
  end: ISODate;
}

/** Financial year containing `iso`. startMonth 4 = April to March. */
export function fyOf(iso: ISODate, startMonth = 4): FinancialYear {
  const p = mustParse(iso);
  const startYear = p.m >= startMonth ? p.y : p.y - 1;
  const start = isoFromYMD(startYear, startMonth, 1);
  const end = addDays(isoFromYMD(startYear + 1, startMonth, 1), -1);
  const label =
    startMonth === 1 ? String(startYear) : tl('FY {0}', `${startYear}-${pad2((startYear + 1) % 100)}`);
  return { label, startYear, start, end };
}

/** Local wall-clock time as 24-hour "HH:MM", for the activity log. */
export function fmtTime(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
