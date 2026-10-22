import { balances, type Account, type MoneyData } from './accounts';
import { lastMonths } from './aggregates';
import { monthBounds } from './dates';
import { loanStatus, type Loan } from './loans';
import { occurrence } from './recurring';
import { owedEffect } from './udhaar';
import type { ISODate } from './types';

/**
 * Net worth: what you have less what you owe. Assets such as gold, deposits and funds have no live
 * prices (Ledger never goes online), so their value is whatever you last entered, dated.
 */

export type AssetKind = 'gold' | 'fd' | 'mutual-fund' | 'stocks' | 'pf' | 'property' | 'other';

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  gold: 'Gold',
  fd: 'Fixed deposit',
  'mutual-fund': 'Mutual funds',
  stocks: 'Stocks',
  pf: 'PF and PPF',
  property: 'Property',
  other: 'Other',
};

export interface AssetValue {
  date: ISODate;
  valueMinor: number;
}

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  /** Values you entered over time; selling it is a value of 0. */
  values: AssetValue[];
  createdAt: number;
  updatedAt: number;
}

export const MAX_ASSET_NAME = 40;

/** The latest value entered on or before `date`; 0 before the first one. */
export function assetValueAt(asset: Pick<Asset, 'values'>, date: ISODate): number {
  let best: AssetValue | undefined;
  for (const v of asset.values) if (v.date <= date && (!best || v.date >= best.date)) best = v;
  return best?.valueMinor ?? 0;
}

/** The newest value entry, if any. */
export function latestValue(asset: Pick<Asset, 'values'>): AssetValue | undefined {
  return [...asset.values].sort((a, b) => b.date.localeCompare(a.date))[0];
}

export interface NetWorthInput {
  accounts: readonly Account[];
  money: MoneyData;
  assets: readonly Asset[];
  loans: readonly Loan[];
}

export interface NetWorth {
  /** Banks, cash and wallets. */
  accountsMinor: number;
  /** Owed on cards (a card paid ahead counts against this). */
  cardsMinor: number;
  assetsMinor: number;
  owedToYouMinor: number;
  youOweMinor: number;
  /** Left to repay on loans. */
  loansMinor: number;
  totalMinor: number;
}

/** A loan counts from a month before its first EMI, when the money came in. */
const loanStart = (loan: Loan): ISODate => occurrence(loan.firstDate, 'monthly', -1);

export function netWorthAt(input: NetWorthInput, date: ISODate): NetWorth {
  const open = input.accounts.filter((a) => a.openingDate <= date);
  const bal = balances(open, input.money, date);
  let accountsMinor = 0;
  let cardsMinor = 0;
  for (const a of open) {
    if (a.kind === 'card') cardsMinor -= bal[a.id] ?? 0;
    else accountsMinor += bal[a.id] ?? 0;
  }
  const assetsMinor = input.assets.reduce((s, a) => s + assetValueAt(a, date), 0);
  const perPerson = new Map<string, number>();
  for (const e of input.money.udhaar)
    if (e.date <= date) perPerson.set(e.personId, (perPerson.get(e.personId) ?? 0) + owedEffect(e));
  let owedToYouMinor = 0;
  let youOweMinor = 0;
  for (const v of perPerson.values()) {
    if (v > 0) owedToYouMinor += v;
    else youOweMinor -= v;
  }
  const loansMinor = input.loans
    .filter((l) => loanStart(l) <= date)
    .reduce((s, l) => s + loanStatus(l, date).remainingMinor, 0);
  return {
    accountsMinor,
    cardsMinor,
    assetsMinor,
    owedToYouMinor,
    youOweMinor,
    loansMinor,
    totalMinor:
      accountsMinor - cardsMinor + assetsMinor + owedToYouMinor - youOweMinor - loansMinor,
  };
}

/** True when nothing at all is recorded yet (no accounts, assets, udhaar or loans). */
export const netWorthEmpty = (input: NetWorthInput): boolean =>
  input.accounts.length === 0 &&
  input.assets.length === 0 &&
  input.loans.length === 0 &&
  input.money.udhaar.length === 0;

export interface NetWorthPoint {
  month: string;
  date: ISODate;
  totalMinor: number;
}

/**
 * Net worth at the end of each of the last `n` months (today for the current one), oldest first,
 * starting from the first month that has anything in it.
 */
export function netWorthHistory(input: NetWorthInput, today: ISODate, n = 12): NetWorthPoint[] {
  const starts = [
    ...input.accounts.map((a) => a.openingDate),
    ...input.assets.flatMap((a) => a.values.map((v) => v.date)),
    ...input.money.udhaar.map((e) => e.date),
    ...input.loans.map(loanStart),
  ].sort();
  const first = starts[0];
  if (!first) return [];
  return lastMonths(today, n)
    .map((month) => {
      const end = monthBounds(month).end;
      const date = end < today ? end : today;
      return { month, date, totalMinor: netWorthAt(input, date).totalMinor };
    })
    .filter((p) => p.date >= first);
}
