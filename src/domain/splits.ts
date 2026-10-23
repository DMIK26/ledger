import type { UdhaarKind } from './udhaar';
import { tl } from './i18n';

/**
 * Splits (Drop 11, after Splitwise). An expense shared with people: the entry's amount is your share,
 * the others' shares become udhaar, and open splits net out to the fewest transfers.
 * A part with `personId: null` is you.
 */

export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares';

export const SPLIT_MODE_LABEL: Record<SplitMode, string> = {
  get equal() {
    return tl('Equally');
  },
  get exact() {
    return tl('Exact amounts');
  },
  get percent() {
    return tl('Percentages');
  },
  get shares() {
    return tl('Shares');
  },
};

export interface SplitPart {
  personId: string | null;
  /** exact: minor units; percent: hundredths of a percent (100% is 10,000); shares: a whole number. */
  value: number;
}

export interface Split {
  totalMinor: number;
  mode: SplitMode;
  /** Who paid the whole bill: null is you. */
  paidBy: string | null;
  parts: Array<SplitPart & { shareMinor: number }>;
  /** The udhaar entries this split created, so editing or deleting it replaces them. */
  udhaarIds: string[];
}

export type ShareResult = { ok: true; shares: number[] } | { ok: false; error: string };

/** Splits `total` in proportion to `weights`, to the paisa, the leftover paise going to the largest remainders. */
function byWeights(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return out;
}

export function shareAmounts(
  totalMinor: number,
  mode: SplitMode,
  parts: readonly SplitPart[],
): ShareResult {
  if (parts.length < 2) return { ok: false, error: tl('Add at least one person to split with') };
  if (!Number.isInteger(totalMinor) || totalMinor <= 0)
    return { ok: false, error: tl('Enter the amount first') };
  if (mode === 'equal')
    return {
      ok: true,
      shares: byWeights(
        totalMinor,
        parts.map(() => 1),
      ),
    };
  if (parts.some((p) => !Number.isInteger(p.value) || p.value < 0))
    return { ok: false, error: tl('Use whole, positive numbers') };
  if (mode === 'exact') {
    const sum = parts.reduce((s, p) => s + p.value, 0);
    return sum === totalMinor
      ? { ok: true, shares: parts.map((p) => p.value) }
      : { ok: false, error: tl('The amounts must add up to the total') };
  }
  if (mode === 'percent') {
    const sum = parts.reduce((s, p) => s + p.value, 0);
    return sum === 10_000
      ? {
          ok: true,
          shares: byWeights(
            totalMinor,
            parts.map((p) => p.value),
          ),
        }
      : { ok: false, error: tl('The percentages must add up to 100') };
  }
  const sum = parts.reduce((s, p) => s + p.value, 0);
  return sum > 0
    ? {
        ok: true,
        shares: byWeights(
          totalMinor,
          parts.map((p) => p.value),
        ),
      }
    : { ok: false, error: tl('Give at least one share') };
}

export const myShare = (split: Pick<Split, 'parts'>): number =>
  split.parts.find((p) => p.personId === null)?.shareMinor ?? 0;

/**
 * The udhaar a split means for you. Paid by you: each other person borrowed their share from you.
 * Paid by someone else: you borrowed your share from them (what others owe them is theirs to track).
 */
export function udhaarForSplit(
  split: Pick<Split, 'paidBy' | 'parts'>,
): Array<{ personId: string; kind: UdhaarKind; amountMinor: number }> {
  if (split.paidBy === null)
    return split.parts
      .filter((p) => p.personId !== null && p.shareMinor > 0)
      .map((p) => ({ personId: p.personId!, kind: 'lent' as const, amountMinor: p.shareMinor }));
  const mine = myShare(split);
  return mine > 0 ? [{ personId: split.paidBy, kind: 'borrowed', amountMinor: mine }] : [];
}

/** What each person is owed (positive) or owes (negative) across these splits; '' is you. */
export function groupBalances(
  splits: ReadonlyArray<Pick<Split, 'paidBy' | 'parts' | 'totalMinor'>>,
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: string | null, v: number) => out.set(id ?? '', (out.get(id ?? '') ?? 0) + v);
  for (const s of splits) {
    add(s.paidBy, s.totalMinor);
    for (const p of s.parts) add(p.personId, -p.shareMinor);
  }
  for (const [k, v] of out) if (v === 0) out.delete(k);
  return out;
}

export interface Transfer {
  /** '' is you. */
  from: string;
  to: string;
  amountMinor: number;
}

/** The fewest transfers that settle the balances: the biggest debtor pays the biggest creditor, and so on. */
export function simplifyDebts(balances: ReadonlyMap<string, number>): Transfer[] {
  const owed = [...balances].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const owes = [...balances].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const byAmount = (a: { id: string; v: number }, b: { id: string; v: number }) =>
    b.v - a.v || a.id.localeCompare(b.id);
  const out: Transfer[] = [];
  owed.sort(byAmount);
  owes.sort(byAmount);
  while (owed.length > 0 && owes.length > 0) {
    const c = owed[0]!;
    const d = owes[0]!;
    const amount = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amountMinor: amount });
    c.v -= amount;
    d.v -= amount;
    if (c.v === 0) owed.shift();
    if (d.v === 0) owes.shift();
    owed.sort(byAmount);
    owes.sort(byAmount);
  }
  return out;
}
