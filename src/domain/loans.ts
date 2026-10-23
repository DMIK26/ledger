import { daysInMonth, isoFromYMD, parseISO, shiftMonth } from './dates';
import { parseAmountToMinor } from './money';
import type { ISODate } from './types';
import type { Space } from './spaces';

/**
 * Loans and EMIs: the standard reducing-balance schedule banks in India use. Interest for a month is the
 * balance times the yearly rate over 12, rounded to the paisa; the last EMI clears what is left.
 * This is a plan for seeing where a loan stands; the EMIs themselves are recurring payments.
 */

export interface Loan {
  id: string;
  /** The Shop ledger's rows say 'shop'; missing means Personal (Drop 13). */
  space?: Space;
  name: string;
  lender: string;
  principalMinor: number;
  /** Yearly interest in hundredths of a percent: 10.5% is 1050. */
  rateBp: number;
  months: number;
  /** The date of the first EMI; later EMIs fall on the same day each month. */
  firstDate: ISODate;
  /** The bank's EMI when it differs from the worked-out one. */
  emiMinor?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleRow {
  n: number;
  date: ISODate;
  emiMinor: number;
  interestMinor: number;
  principalMinor: number;
  /** What is left to repay after this EMI. */
  balanceMinor: number;
}

export const MAX_LOAN_MONTHS = 600;

/** "10.5" or "10.50%" to 1050. Null when it is not a rate between 0 and 99.99. */
export function parseRateBp(text: string): number | null {
  const bp = parseAmountToMinor(text.replace(/%/g, '').trim());
  return bp !== null && bp < 10_000 ? bp : null;
}

/** "10.5" from 1050, for showing a rate (it is not money, so it never goes through fmtMoney). */
export function rateText(rateBp: number): string {
  const whole = Math.floor(rateBp / 100);
  const frac = rateBp % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

const monthlyInterest = (balanceMinor: number, rateBp: number): number =>
  Math.round((balanceMinor * rateBp) / 120_000);

/** The EMI that repays `principalMinor` in `months` at `rateBp`, rounded to the paisa. */
export function emiFor(principalMinor: number, rateBp: number, months: number): number {
  if (months <= 0) return principalMinor;
  if (rateBp === 0) return Math.ceil(principalMinor / months);
  const r = rateBp / 120_000;
  const f = (1 + r) ** months;
  return Math.round((principalMinor * r * f) / (f - 1));
}

const dateOfEmi = (first: ISODate, index: number): ISODate => {
  const p = parseISO(first)!;
  const t = shiftMonth(p.y, p.m, index);
  return isoFromYMD(t.y, t.m, Math.min(p.d, daysInMonth(t.y, t.m)));
};

export const loanEmi = (
  loan: Pick<Loan, 'principalMinor' | 'rateBp' | 'months' | 'emiMinor'>,
): number => loan.emiMinor ?? emiFor(loan.principalMinor, loan.rateBp, loan.months);

/**
 * Every EMI until the loan is repaid, paying `extraMinor` more each month. Stops after MAX_LOAN_MONTHS;
 * an EMI that does not even cover the interest never repays the loan, and the schedule says so by not
 * reaching zero.
 */
export function schedule(loan: Loan, extraMinor = 0): ScheduleRow[] {
  const pay = loanEmi(loan) + Math.max(0, extraMinor);
  const rows: ScheduleRow[] = [];
  let balance = loan.principalMinor;
  for (let n = 1; balance > 0 && n <= MAX_LOAN_MONTHS; n += 1) {
    const interestMinor = monthlyInterest(balance, loan.rateBp);
    let principalMinor = pay - interestMinor;
    if (principalMinor <= 0) {
      rows.push({
        n,
        date: dateOfEmi(loan.firstDate, n - 1),
        emiMinor: pay,
        interestMinor,
        principalMinor: 0,
        balanceMinor: balance,
      });
      break;
    }
    if (principalMinor > balance) principalMinor = balance;
    balance -= principalMinor;
    rows.push({
      n,
      date: dateOfEmi(loan.firstDate, n - 1),
      emiMinor: principalMinor + interestMinor,
      interestMinor,
      principalMinor,
      balanceMinor: balance,
    });
  }
  return rows;
}

export interface LoanStatus {
  emiMinor: number;
  totalCount: number;
  paidCount: number;
  /** Principal left to repay after the EMIs due so far. */
  remainingMinor: number;
  nextDate: ISODate | null;
  endDate: ISODate | null;
  interestTotalMinor: number;
  interestLeftMinor: number;
  /** False when the EMI does not cover the interest, so the loan never ends. */
  repays: boolean;
}

export function loanStatus(loan: Loan, today: ISODate, extraMinor = 0): LoanStatus {
  const rows = schedule(loan, extraMinor);
  const paid = rows.filter((r) => r.date <= today);
  const last = rows[rows.length - 1];
  const repays = last !== undefined && last.balanceMinor === 0;
  const interestTotalMinor = rows.reduce((s, r) => s + r.interestMinor, 0);
  return {
    emiMinor: loanEmi(loan) + Math.max(0, extraMinor),
    totalCount: rows.length,
    paidCount: paid.length,
    remainingMinor: paid.length > 0 ? paid[paid.length - 1]!.balanceMinor : loan.principalMinor,
    nextDate: rows.find((r) => r.date > today)?.date ?? null,
    endDate: last?.date ?? null,
    interestTotalMinor,
    interestLeftMinor: rows.filter((r) => r.date > today).reduce((s, r) => s + r.interestMinor, 0),
    repays,
  };
}

/** What paying `extraMinor` more each month does: months saved and interest saved. */
export function prepayEffect(
  loan: Loan,
  extraMinor: number,
): { monthsSaved: number; interestSavedMinor: number; endDate: ISODate | null } {
  const base = schedule(loan);
  const faster = schedule(loan, extraMinor);
  const interest = (rows: ScheduleRow[]) => rows.reduce((s, r) => s + r.interestMinor, 0);
  return {
    monthsSaved: Math.max(0, base.length - faster.length),
    interestSavedMinor: Math.max(0, interest(base) - interest(faster)),
    endDate: faster[faster.length - 1]?.date ?? null,
  };
}
