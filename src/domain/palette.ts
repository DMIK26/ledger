import { normalizeMerchantKey } from './categoriser';
import type { Transaction } from './types';

/** The command palette's matching (Drop 11): plain, predictable, no fuzzy magic beyond word starts. */

export interface PaletteItem {
  id: string;
  label: string;
  group: string;
  /** Extra words that should find it ("search" for Transactions, "theme" for Dark theme). */
  keywords?: string;
}

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * How well an item matches: every typed word must start a word of the label or keywords. Labels that
 * start with the query come first, then word starts in the label, then keyword-only matches.
 * Null when it does not match.
 */
export function scoreItem(
  item: Pick<PaletteItem, 'label' | 'keywords'>,
  query: string,
): number | null {
  const q = words(query);
  if (q.length === 0) return 0;
  const label = words(item.label);
  const extra = words(item.keywords ?? '');
  let score = 0;
  for (const w of q) {
    if (label.some((l) => l.startsWith(w))) score += 2;
    else if (extra.some((k) => k.startsWith(w))) score += 1;
    else return null;
  }
  if (item.label.toLowerCase().startsWith(query.trim().toLowerCase())) score += 3;
  return score;
}

export function rankItems<T extends PaletteItem>(items: readonly T[], query: string): T[] {
  return items
    .map((item, i) => ({ item, i, s: scoreItem(item, query) }))
    .filter((x): x is { item: T; i: number; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}

export interface MerchantMatch {
  key: string;
  name: string;
  count: number;
}

/** Merchants whose name has a word starting with each typed word, most used first. */
export function merchantMatches(
  transactions: readonly Pick<Transaction, 'merchant' | 'date'>[],
  query: string,
  limit = 5,
): MerchantMatch[] {
  if (words(query).length === 0) return [];
  const map = new Map<string, MerchantMatch & { last: string }>();
  for (const t of transactions) {
    const key = normalizeMerchantKey(t.merchant);
    if (!key) continue;
    const m = map.get(key) ?? { key, name: t.merchant, count: 0, last: '' };
    m.count += 1;
    if (t.date >= m.last) {
      m.last = t.date;
      m.name = t.merchant;
    }
    map.set(key, m);
  }
  return [...map.values()]
    .filter((m) => scoreItem({ label: m.name }, query) !== null)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ key, name, count }) => ({ key, name, count }));
}
