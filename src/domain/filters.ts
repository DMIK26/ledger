import { categoryById } from './categories';
import { fmtDate, parseISO } from './dates';
import { normalizeMerchantKey } from './categoriser';
import type { Category, ISODate, PaymentMethod, Transaction } from './types';
import { tl } from './i18n';

export const PAGE_SIZE = 15;

export interface Filters {
  from?: ISODate;
  to?: ISODate;
  categories: string[];
  methods: PaymentMethod[];
  tags: string[];
  minMinor?: number;
  maxMinor?: number;
}

export type SortKey = 'date' | 'amount' | 'merchant';
export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}
export type GroupBy = 'none' | 'day' | 'category' | 'merchant' | 'method';

export interface SavedView {
  id: string;
  name: string;
  filters: Filters;
  sort: Sort;
  groupBy: GroupBy;
}

export const EMPTY_FILTERS: Filters = { categories: [], methods: [], tags: [] };
export const DEFAULT_SORT: Sort = { key: 'date', dir: 'desc' };

export function isFiltered(f: Filters): boolean {
  return (
    f.from !== undefined ||
    f.to !== undefined ||
    f.minMinor !== undefined ||
    f.maxMinor !== undefined ||
    f.categories.length > 0 ||
    f.methods.length > 0 ||
    f.tags.length > 0
  );
}

type Facet = 'categories' | 'methods' | 'tags';

function matches(t: Transaction, f: Filters, skip?: Facet): boolean {
  if (f.from && t.date < f.from) return false;
  if (f.to && t.date > f.to) return false;
  if (f.minMinor !== undefined && t.amountMinor < f.minMinor) return false;
  if (f.maxMinor !== undefined && t.amountMinor > f.maxMinor) return false;
  if (skip !== 'categories' && f.categories.length > 0 && !f.categories.includes(t.categoryId))
    return false;
  if (skip !== 'methods' && f.methods.length > 0 && !f.methods.includes(t.method)) return false;
  if (skip !== 'tags' && f.tags.length > 0 && !f.tags.some((tag) => t.tags.includes(tag)))
    return false;
  return true;
}

export function applyFilters(list: readonly Transaction[], f: Filters): Transaction[] {
  return list.filter((t) => matches(t, f));
}

export interface FacetCounts {
  categories: Record<string, number>;
  methods: Record<string, number>;
  tags: Record<string, number>;
}

/** How many entries each option would show, given every other active filter (standard faceting). */
export function facetCounts(list: readonly Transaction[], f: Filters): FacetCounts {
  const out: FacetCounts = { categories: {}, methods: {}, tags: {} };
  const bump = (rec: Record<string, number>, k: string) => {
    rec[k] = (rec[k] ?? 0) + 1;
  };
  for (const t of list) {
    if (matches(t, f, 'categories')) bump(out.categories, t.categoryId);
    if (matches(t, f, 'methods')) bump(out.methods, t.method);
    if (matches(t, f, 'tags')) for (const tag of new Set(t.tags)) bump(out.tags, tag);
  }
  return out;
}

export function sortTransactions(list: readonly Transaction[], s: Sort): Transaction[] {
  const dir = s.dir === 'asc' ? 1 : -1;
  const cmp = (a: Transaction, b: Transaction): number => {
    let c: number;
    if (s.key === 'amount') c = a.amountMinor - b.amountMinor;
    else if (s.key === 'merchant')
      c = a.merchant.localeCompare(b.merchant, 'en', { sensitivity: 'base' });
    else c = a.date.localeCompare(b.date);
    if (c === 0) c = a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
    return c * dir;
  };
  return [...list].sort(cmp);
}

export interface Group {
  key: string;
  label: string;
  items: Transaction[];
  totalMinor: number;
}

/** Groups keep the order in which their first entry appears in the (already sorted) list. */
export function groupTransactions(
  list: readonly Transaction[],
  by: GroupBy,
  categories: readonly Category[],
): Group[] {
  if (by === 'none') {
    return [
      {
        key: 'all',
        label: '',
        items: [...list],
        totalMinor: list.reduce((s, t) => s + t.amountMinor, 0),
      },
    ];
  }
  const groups = new Map<string, Group>();
  for (const t of list) {
    let key: string;
    let label: string;
    if (by === 'day') {
      key = t.date;
      label = fmtDate(t.date);
    } else if (by === 'category') {
      key = t.categoryId;
      label = categoryById(categories, t.categoryId)?.name ?? tl('Other');
    } else if (by === 'merchant') {
      key = normalizeMerchantKey(t.merchant) || '(none)';
      label = t.merchant || tl('Untitled');
    } else {
      key = t.method;
      label = t.method;
    }
    let g = groups.get(key);
    if (!g) {
      g = { key, label, items: [], totalMinor: 0 };
      groups.set(key, g);
    }
    g.items.push(t);
    g.totalMinor += t.amountMinor;
  }
  return [...groups.values()];
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function pageSlice<T>(list: readonly T[], page: number, size = PAGE_SIZE): T[] {
  const p = Math.min(Math.max(1, page), pageCount(list.length, size));
  return list.slice((p - 1) * size, p * size);
}

export function allTags(list: readonly Transaction[]): string[] {
  return [...new Set(list.flatMap((t) => t.tags))].sort();
}

/** Filters from the address, as other pages link to Transactions (a category, a date range). */
export function filtersFromQuery(query: URLSearchParams): Filters {
  const date = (v: string | null) => (v && parseISO(v) ? v : undefined);
  const category = query.get('category');
  return {
    ...EMPTY_FILTERS,
    categories: category ? [category] : [],
    from: date(query.get('from')),
    to: date(query.get('to')),
  };
}
