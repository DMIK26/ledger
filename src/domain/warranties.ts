import { daysInMonth, diffDays, isoFromYMD, parseISO } from './dates';
import type { ISODate, Transaction } from './types';

/** Warranties (Drop 12): a length in months on an entry; it ends that many months after the purchase. */

export const MAX_WARRANTY_MONTHS = 120;
export const WARRANTY_SOON_DAYS = 30;
/** Ended warranties stay on the list this long. */
export const WARRANTY_ENDED_DAYS = 90;

/** The purchase date plus `months` (31 Jan plus one month is 28 or 29 Feb). */
export function warrantyEnd(date: ISODate, months: number): ISODate {
  const p = parseISO(date)!;
  const total = p.m - 1 + months;
  const y = p.y + Math.floor(total / 12);
  const m = (total % 12) + 1;
  return isoFromYMD(y, m, Math.min(p.d, daysInMonth(y, m)));
}

export interface WarrantyRow {
  tx: Transaction;
  ends: ISODate;
  /** Negative once it has ended. */
  daysLeft: number;
}

export function warranties(
  transactions: readonly Transaction[],
  today: ISODate,
): { active: WarrantyRow[]; ended: WarrantyRow[] } {
  const active: WarrantyRow[] = [];
  const ended: WarrantyRow[] = [];
  for (const tx of transactions) {
    if (!tx.warrantyMonths || tx.warrantyMonths <= 0) continue;
    const ends = warrantyEnd(tx.date, tx.warrantyMonths);
    const daysLeft = diffDays(ends, today);
    if (daysLeft >= 0) active.push({ tx, ends, daysLeft });
    else if (-daysLeft <= WARRANTY_ENDED_DAYS) ended.push({ tx, ends, daysLeft });
  }
  active.sort((a, b) => a.ends.localeCompare(b.ends));
  ended.sort((a, b) => b.ends.localeCompare(a.ends));
  return { active, ended };
}
