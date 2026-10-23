import { fmtMoney } from './money';
import { fmtDate } from './dates';
import type { ISODate } from './types';
import type { Space } from './spaces';
import { tl } from './i18n';

/**
 * Udhaar: money lent to and borrowed from people, settled in parts over time (like a personal khata).
 * Never spending or income; with an account picked, it moves that account's balance.
 */

export type UdhaarKind = 'lent' | 'borrowed' | 'got-back' | 'paid-back';

export const UDHAAR_LABEL: Record<UdhaarKind, string> = {
  get lent() {
    return tl('I lent');
  },
  get borrowed() {
    return tl('I borrowed');
  },
  get 'got-back'() {
    return tl('They paid me back');
  },
  get 'paid-back'() {
    return tl('I paid back');
  },
};

export interface Person {
  id: string;
  /** The Shop ledger's rows say 'shop'; missing means Personal (Drop 13). */
  space?: Space;
  name: string;
  createdAt: number;
}

export interface UdhaarEntry {
  id: string;
  /** The Shop ledger's rows say 'shop'; missing means Personal (Drop 13). */
  space?: Space;
  personId: string;
  kind: UdhaarKind;
  date: ISODate;
  /** Integer minor units, always positive; the kind says which way it went. */
  amountMinor: number;
  note: string;
  accountId?: string;
  createdAt: number;
  updatedAt: number;
}

/** What one entry does to "they owe you": lending and paying back raise it, the others lower it. */
export function owedEffect(e: Pick<UdhaarEntry, 'kind' | 'amountMinor'>): number {
  return e.kind === 'lent' || e.kind === 'paid-back' ? e.amountMinor : -e.amountMinor;
}

/** What one entry does to the account it names: lending or paying back takes money out. */
export function udhaarAccountEffect(e: Pick<UdhaarEntry, 'kind' | 'amountMinor'>): number {
  return e.kind === 'lent' || e.kind === 'paid-back' ? -e.amountMinor : e.amountMinor;
}

/** Positive: they owe you. Negative: you owe them. */
export function personBalance(entries: readonly UdhaarEntry[], personId: string): number {
  return entries.filter((e) => e.personId === personId).reduce((s, e) => s + owedEffect(e), 0);
}

export interface PersonSummary {
  person: Person;
  balanceMinor: number;
  lastDate: ISODate | null;
}

/** Everyone, those with an open balance first (largest first), then settled people by name. */
export function udhaarSummary(
  people: readonly Person[],
  entries: readonly UdhaarEntry[],
): PersonSummary[] {
  return people
    .map((person) => {
      const mine = entries.filter((e) => e.personId === person.id);
      const lastDate = mine.reduce<ISODate | null>(
        (d, e) => (d === null || e.date > d ? e.date : d),
        null,
      );
      return { person, balanceMinor: personBalance(entries, person.id), lastDate };
    })
    .sort(
      (a, b) =>
        Number(b.balanceMinor !== 0) - Number(a.balanceMinor !== 0) ||
        Math.abs(b.balanceMinor) - Math.abs(a.balanceMinor) ||
        a.person.name.localeCompare(b.person.name),
    );
}

export function udhaarTotals(summary: readonly PersonSummary[]): {
  owedToYouMinor: number;
  youOweMinor: number;
} {
  let owedToYouMinor = 0;
  let youOweMinor = 0;
  for (const s of summary) {
    if (s.balanceMinor > 0) owedToYouMinor += s.balanceMinor;
    else youOweMinor -= s.balanceMinor;
  }
  return { owedToYouMinor, youOweMinor };
}

/** The entry that settles a balance in full: they pay you back, or you pay them back. */
export function settleKind(balanceMinor: number): UdhaarKind | null {
  if (balanceMinor > 0) return 'got-back';
  if (balanceMinor < 0) return 'paid-back';
  return null;
}

/**
 * A short, polite reminder to send through the share sheet. It carries the real amount, so callers
 * only offer it with privacy mode off (`reveal` bypasses the mask for this one message).
 */
export function reminderText(
  name: string,
  balanceMinor: number,
  since: ISODate | null,
  currency = 'INR',
): string {
  const amount = fmtMoney(balanceMinor, { currency, reveal: true });
  const when = since ? ' ' + tl('from {0}', fmtDate(since)) : '';
  return tl(
    'Hi {0}, a gentle reminder about the {1}{2}. No rush, whenever it suits you. Thanks.',
    name,
    amount,
    when,
  );
}

export const MAX_PERSON_NAME = 40;

/** Finds a person by name, ignoring case and extra spaces. */
export function findPerson(people: readonly Person[], name: string): Person | undefined {
  const key = name.trim().replace(/\s+/g, ' ').toLowerCase();
  return people.find((p) => p.name.trim().replace(/\s+/g, ' ').toLowerCase() === key);
}
