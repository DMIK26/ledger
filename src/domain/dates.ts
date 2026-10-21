import type { ISODate } from './types';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

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

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const index = y * 12 + (m - 1) + delta;
  return { y: Math.floor(index / 12), m: ((index % 12) + 12) % 12 + 1 };
}

export function fmtDate(iso: ISODate): string {
  const p = mustParse(iso);
  return `${p.d} ${MONTHS[p.m - 1]!.slice(0, 3)} ${p.y}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
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
    startMonth === 1 ? String(startYear) : `FY ${startYear}-${pad2((startYear + 1) % 100)}`;
  return { label, startYear, start, end };
}
