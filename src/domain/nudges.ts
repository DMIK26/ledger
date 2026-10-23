import { normalizeMerchantKey } from './categoriser';
import { addDays, diffDays } from './dates';
import { yearlyCost, type RecurringItem } from './recurring';
import type { ISODate, Transaction } from './types';
import { warranties, WARRANTY_SOON_DAYS } from './warranties';

/**
 * Nudges (Drop 12): a few things worth a second look, shown in the app only. Each has an id so that,
 * once put away, it stays away.
 */

/** Entries this recent are checked for unusual amounts and repeats. */
export const NUDGE_DAYS = 14;
/** An amount is unusual at this many times the merchant's usual (the median) ... */
export const UNUSUAL_TIMES = 2;
/** ... and at least this much more (₹200). */
export const UNUSUAL_GAP_MINOR = 200_00;
const PRICE_DAYS = 45;

export type Nudge =
  | {
      kind: 'unusual';
      id: string;
      tx: Transaction;
      usualMinor: number;
      /** Whole times the usual amount. */
      times: number;
      merchantKey: string;
    }
  | { kind: 'duplicate'; id: string; first: Transaction; second: Transaction }
  | {
      kind: 'price';
      id: string;
      item: RecurringItem;
      fromMinor: number;
      toMinor: number;
      /** How much more it costs over a year at the new price. */
      yearlyMinor: number;
      latest: Transaction;
    }
  | { kind: 'warranty'; id: string; tx: Transaction; ends: ISODate; daysLeft: number };

const median = (values: readonly number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

const byTime = (a: Transaction, b: Transaction) =>
  a.date.localeCompare(b.date) || a.createdAt - b.createdAt;

export function findNudges(input: {
  transactions: readonly Transaction[];
  recurring: readonly RecurringItem[];
  today: ISODate;
  dismissed: readonly string[];
}): Nudge[] {
  const { today } = input;
  const since = addDays(today, -(NUDGE_DAYS - 1));
  const dismissed = new Set(input.dismissed);
  const out: Nudge[] = [];
  const byKey = new Map<string, Transaction[]>();
  for (const t of input.transactions) {
    const key = normalizeMerchantKey(t.merchant);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(t);
    byKey.set(key, list);
  }
  for (const list of byKey.values()) list.sort(byTime);

  // Repeats: the same merchant and amount within a day of each other.
  for (const list of byKey.values()) {
    for (let i = 1; i < list.length; i += 1) {
      const a = list[i - 1]!;
      const b = list[i]!;
      if (b.date < since || b.date > today) continue;
      if (a.amountMinor !== b.amountMinor || Math.abs(diffDays(b.date, a.date)) > 1) continue;
      out.push({ kind: 'duplicate', id: `dup:${a.id}:${b.id}`, first: a, second: b });
    }
  }

  // Unusual amounts: at least twice the median of three or more earlier entries in the year before.
  for (const [key, list] of byKey) {
    list.forEach((t, i) => {
      if (t.date < since || t.date > today) return;
      const earlier = list
        .slice(0, i)
        .filter((e) => diffDays(t.date, e.date) <= 365)
        .map((e) => e.amountMinor);
      if (earlier.length < 3) return;
      const usual = median(earlier);
      if (usual <= 0) return;
      if (t.amountMinor < usual * UNUSUAL_TIMES || t.amountMinor - usual < UNUSUAL_GAP_MINOR)
        return;
      out.push({
        kind: 'unusual',
        id: `unusual:${t.id}`,
        tx: t,
        usualMinor: usual,
        times: Math.round(t.amountMinor / usual),
        merchantKey: key,
      });
    });
  }

  // Price rises: a recurring payment's latest charge above the one before it.
  for (const item of input.recurring) {
    const key = normalizeMerchantKey(item.merchant);
    const list = input.transactions
      .filter((t) => t.recurringId === item.id || (key && normalizeMerchantKey(t.merchant) === key))
      .sort(byTime);
    const latest = list[list.length - 1];
    const before = list[list.length - 2];
    if (!latest || !before || latest.amountMinor <= before.amountMinor) continue;
    if (diffDays(today, latest.date) > PRICE_DAYS || latest.date > today) continue;
    out.push({
      kind: 'price',
      id: `price:${item.id}:${latest.id}`,
      item,
      fromMinor: before.amountMinor,
      toMinor: latest.amountMinor,
      yearlyMinor:
        yearlyCost({ amountMinor: latest.amountMinor, cadence: item.cadence }) -
        yearlyCost({ amountMinor: before.amountMinor, cadence: item.cadence }),
      latest,
    });
  }

  // Warranties ending soon.
  for (const w of warranties(input.transactions, today).active) {
    if (w.daysLeft > WARRANTY_SOON_DAYS) continue;
    out.push({
      kind: 'warranty',
      id: `warranty:${w.tx.id}`,
      tx: w.tx,
      ends: w.ends,
      daysLeft: w.daysLeft,
    });
  }

  const order = { duplicate: 0, unusual: 1, price: 2, warranty: 3 } as const;
  return out
    .filter((n) => !dismissed.has(n.id))
    .sort((a, b) => order[a.kind] - order[b.kind] || nudgeDate(b).localeCompare(nudgeDate(a)));
}

const nudgeDate = (n: Nudge): ISODate =>
  n.kind === 'unusual' || n.kind === 'warranty'
    ? n.tx.date
    : n.kind === 'duplicate'
      ? n.second.date
      : n.latest.date;
