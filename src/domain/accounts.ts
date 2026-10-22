import { daysInMonth, diffDays, isoFromYMD, monthKey, parseISO, shiftMonth } from './dates';
import type { ISODate, PaymentMethod, Transaction } from './types';
import { udhaarAccountEffect, type UdhaarEntry } from './udhaar';

/**
 * Accounts, money in, transfers, fees and the cash-flow view (Drop 9). Spending stays in `transactions`;
 * everything here is kept apart so budgets, KPIs, charts and reports never count it as spending.
 */

export type AccountKind = 'bank' | 'cash' | 'wallet' | 'card';

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  bank: 'Bank account',
  cash: 'Cash',
  wallet: 'Wallet',
  card: 'Credit card',
};

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Balance at the start of `openingDate`. For a card: what was owed then (positive). */
  openingMinor: number;
  openingDate: ISODate;
  /** Payment methods whose entries come out of this account when an entry names no account. */
  methods: PaymentMethod[];
  order: number;
  archived?: boolean;
  /** Cards: the day each statement is made and the day payment is due (1 to 28). */
  statementDay?: number;
  dueDay?: number;
  limitMinor?: number;
  createdAt: number;
  updatedAt: number;
}

export type IncomeKind = 'salary' | 'business' | 'interest' | 'gift' | 'refund' | 'other';

export const INCOME_KINDS: Record<IncomeKind, string> = {
  salary: 'Salary',
  business: 'Business',
  interest: 'Interest',
  gift: 'Gift',
  refund: 'Refund',
  other: 'Other',
};

/**
 * income: money in to an account. transfer: from `accountId` to `toAccountId` (paying a card is one).
 * fee: interest or a charge on an account; raises what a card owes, never counts as spending.
 * adjust: a correction after a cash check; the only kind whose amount may be negative.
 */
export type FlowKind = 'income' | 'transfer' | 'fee' | 'adjust';

export interface Flow {
  id: string;
  kind: FlowKind;
  date: ISODate;
  /** Integer minor units. Positive, except an adjustment, which is signed. */
  amountMinor: number;
  label: string;
  incomeKind?: IncomeKind;
  accountId?: string;
  toAccountId?: string;
  /** The text typed into quick add, when it came from there. */
  raw?: string;
  createdAt: number;
  updatedAt: number;
}

/** Sensible methods for a new account: the first bank takes UPI and bank transfers, and so on. */
export function defaultMethods(kind: AccountKind, existing: readonly Account[]): PaymentMethod[] {
  const taken = new Set(existing.filter((a) => !a.archived).flatMap((a) => a.methods));
  const wanted: Record<AccountKind, PaymentMethod[]> = {
    bank: ['UPI', 'Bank transfer'],
    cash: ['Cash'],
    card: ['Card'],
    wallet: [],
  };
  return wanted[kind].filter((m) => !taken.has(m));
}

/** The account a payment method belongs to (open accounts first, in the user's order). */
export function accountForMethod(
  accounts: readonly Account[],
  method: PaymentMethod,
): Account | undefined {
  const sorted = [...accounts].sort(
    (a, b) => Number(Boolean(a.archived)) - Number(Boolean(b.archived)) || a.order - b.order,
  );
  return sorted.find((a) => a.methods.includes(method));
}

export const expenseAccountId = (
  tx: Pick<Transaction, 'accountId' | 'method'>,
  accounts: readonly Account[],
): string | undefined => tx.accountId ?? accountForMethod(accounts, tx.method)?.id;

export interface MoneyData {
  transactions: readonly Pick<Transaction, 'date' | 'amountMinor' | 'method' | 'accountId'>[];
  flows: readonly Flow[];
  udhaar: readonly UdhaarEntry[];
}

/**
 * Every account's balance at the end of `asOf`. Asset accounts are positive when they hold money; a card
 * is negative by what is owed. Only things dated on or after an account's opening date count.
 */
export function balances(
  accounts: readonly Account[],
  data: MoneyData,
  asOf: ISODate,
): Record<string, number> {
  const out: Record<string, number> = {};
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const a of accounts) out[a.id] = a.kind === 'card' ? -a.openingMinor : a.openingMinor;
  const move = (id: string | undefined, date: ISODate, delta: number) => {
    if (!id) return;
    const a = byId.get(id);
    if (!a || date < a.openingDate || date > asOf) return;
    out[id] = (out[id] ?? 0) + delta;
  };
  for (const t of data.transactions) move(expenseAccountId(t, accounts), t.date, -t.amountMinor);
  for (const f of data.flows) {
    if (f.kind === 'income') move(f.accountId, f.date, f.amountMinor);
    else if (f.kind === 'fee') move(f.accountId, f.date, -f.amountMinor);
    else if (f.kind === 'adjust') move(f.accountId, f.date, f.amountMinor);
    else {
      move(f.accountId, f.date, -f.amountMinor);
      move(f.toAccountId, f.date, f.amountMinor);
    }
  }
  for (const u of data.udhaar) move(u.accountId, u.date, udhaarAccountEffect(u));
  return out;
}

/** The date in month (y, m) with the given day, or the month's last day when it is shorter. */
const dayIn = (y: number, m: number, day: number): ISODate =>
  isoFromYMD(y, m, Math.min(day, daysInMonth(y, m)));

/** The latest date on or before `today` that falls on `day` of its month. */
export function lastDateOnDay(today: ISODate, day: number): ISODate {
  const p = parseISO(today)!;
  const here = dayIn(p.y, p.m, day);
  if (here <= today) return here;
  const prev = shiftMonth(p.y, p.m, -1);
  return dayIn(prev.y, prev.m, day);
}

/** The first date after `from` that falls on `day` of its month. */
export function nextDateOnDay(from: ISODate, day: number): ISODate {
  const p = parseISO(from)!;
  const here = dayIn(p.y, p.m, day);
  if (here > from) return here;
  const next = shiftMonth(p.y, p.m, 1);
  return dayIn(next.y, next.m, day);
}

export interface CardStatus {
  owedMinor: number;
  /** The latest statement date, when a statement day is set. */
  statementDate: ISODate | null;
  /** What that statement asked for. */
  statementMinor: number;
  /** Payments into the card since that statement. */
  paidSinceMinor: number;
  /** Left to pay on that statement. */
  dueMinor: number;
  dueDate: ISODate | null;
  daysToDue: number | null;
  overdue: boolean;
  /** Limit left, when a limit is set. */
  availableMinor: number | null;
}

export function cardStatus(
  card: Account,
  accounts: readonly Account[],
  data: MoneyData,
  today: ISODate,
): CardStatus {
  const owedMinor = Math.max(0, -(balances(accounts, data, today)[card.id] ?? 0));
  const availableMinor =
    card.limitMinor !== undefined ? Math.max(0, card.limitMinor - owedMinor) : null;
  if (!card.statementDay) {
    return {
      owedMinor,
      statementDate: null,
      statementMinor: 0,
      paidSinceMinor: 0,
      dueMinor: 0,
      dueDate: null,
      daysToDue: null,
      overdue: false,
      availableMinor,
    };
  }
  const statementDate = lastDateOnDay(today, card.statementDay);
  const statementMinor = Math.max(0, -(balances(accounts, data, statementDate)[card.id] ?? 0));
  const paidSinceMinor = data.flows
    .filter(
      (f) =>
        f.kind === 'transfer' &&
        f.toAccountId === card.id &&
        f.date > statementDate &&
        f.date <= today,
    )
    .reduce((s, f) => s + f.amountMinor, 0);
  const dueMinor = Math.max(0, statementMinor - paidSinceMinor);
  const dueDate = card.dueDay ? nextDateOnDay(statementDate, card.dueDay) : null;
  const daysToDue = dueDate ? diffDays(dueDate, today) : null;
  return {
    owedMinor,
    statementDate,
    statementMinor,
    paidSinceMinor,
    dueMinor,
    dueDate,
    daysToDue,
    overdue: dueMinor > 0 && daysToDue !== null && daysToDue < 0,
    availableMinor,
  };
}

/** Cards with something to pay within `days` (or already late), soonest first. */
export function cardsDueSoon(
  accounts: readonly Account[],
  data: MoneyData,
  today: ISODate,
  days = 7,
): Array<{ card: Account; status: CardStatus }> {
  return accounts
    .filter((a) => a.kind === 'card' && !a.archived)
    .map((card) => ({ card, status: cardStatus(card, accounts, data, today) }))
    .filter(
      ({ status }) => status.dueMinor > 0 && status.daysToDue !== null && status.daysToDue <= days,
    )
    .sort((a, b) => (a.status.daysToDue ?? 0) - (b.status.daysToDue ?? 0));
}

export interface CashFlow {
  month: string;
  inMinor: number;
  spentMinor: number;
  feesMinor: number;
  outMinor: number;
  leftMinor: number;
}

/** Money in against money out for one month, up to `asOf` (spending plus interest and fees). */
export function cashFlow(
  transactions: readonly Pick<Transaction, 'date' | 'amountMinor'>[],
  flows: readonly Flow[],
  month: string,
  asOf: ISODate,
): CashFlow {
  const inMonth = (d: ISODate) => d <= asOf && monthKey(d) === month;
  const spentMinor = transactions
    .filter((t) => inMonth(t.date))
    .reduce((s, t) => s + t.amountMinor, 0);
  let inMinor = 0;
  let feesMinor = 0;
  for (const f of flows) {
    if (!inMonth(f.date)) continue;
    if (f.kind === 'income') inMinor += f.amountMinor;
    else if (f.kind === 'fee') feesMinor += f.amountMinor;
  }
  const outMinor = spentMinor + feesMinor;
  return { month, inMinor, spentMinor, feesMinor, outMinor, leftMinor: inMinor - outMinor };
}

/**
 * A cash count: what the wallet holds against what Ledger expects. Positive `differenceMinor` means
 * there is more cash than expected; negative means some spending was not logged.
 */
export function cashCheck(
  expectedMinor: number,
  countedMinor: number,
): { differenceMinor: number } {
  return { differenceMinor: countedMinor - expectedMinor };
}

const INCOME_PATTERNS: Array<[RegExp, IncomeKind]> = [
  [/\b(?:salary|bonus|stipend|wages?|payslip|paycheck|incentive)\b/i, 'salary'],
  [/\b(?:dividends?|interest|fd)\b/i, 'interest'],
  [/\b(?:refunds?|refunded|cashback|reversal|reversed)\b/i, 'refund'],
  [/\b(?:gifts?|shagun|birthday)\b/i, 'gift'],
  [/\b(?:business|sales?|invoice|client|freelance|consulting|commission|order)\b/i, 'business'],
];

/** The kind of money in that a description suggests ("salary" is Salary, "cashback" a Refund). */
export function incomeKindFor(text: string): IncomeKind {
  return INCOME_PATTERNS.find(([re]) => re.test(text))?.[1] ?? 'other';
}
