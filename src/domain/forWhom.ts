import type { ISODate, Transaction } from './types';

/** Spent for whom (Drop 12): who an entry was for, such as a family member or the shop. */

export interface ForWhomRow {
  /** '' is you (entries with nobody named). */
  name: string;
  totalMinor: number;
  count: number;
}

/** Spending in the range per person it was for (Drop 12), largest first; "you" included. */
export function spentFor(
  list: readonly Pick<Transaction, 'date' | 'amountMinor' | 'forWhom'>[],
  start: ISODate,
  end: ISODate,
): ForWhomRow[] {
  const rows = new Map<string, ForWhomRow>();
  for (const t of list) {
    if (t.date < start || t.date > end) continue;
    const name = t.forWhom?.trim() ?? '';
    const key = name.toLowerCase();
    const row = rows.get(key) ?? { name, totalMinor: 0, count: 0 };
    row.totalMinor += t.amountMinor;
    row.count += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) => b.totalMinor - a.totalMinor || a.name.localeCompare(b.name),
  );
}

/** Names already used for "for whom", most used first, for suggestions. */
export function forWhomNames(list: readonly Pick<Transaction, 'forWhom'>[]): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const t of list) {
    const name = t.forWhom?.trim();
    if (!name) continue;
    const c = counts.get(name.toLowerCase()) ?? { name, n: 0 };
    c.n += 1;
    counts.set(name.toLowerCase(), c);
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .map((c) => c.name);
}
