import { normalizeMerchantKey } from './categoriser';
import type { Category, CategoryId, Subcategory, Transaction } from './types';
import { tl } from './i18n';

/**
 * Subcategories (Drop 12): one level inside a category. An entry keeps its category and may also name
 * one of that category's subcategories, so every chart, budget and report rolls them up by itself.
 */

export const MAX_SUBCATEGORY_NAME = 30;

export const subcategoriesOf = (
  categories: readonly Category[],
  categoryId: CategoryId,
): Subcategory[] => categories.find((c) => c.id === categoryId)?.subcategories ?? [];

/** The subcategory and its category for an id, if both still exist. */
export function findSubcategory(
  categories: readonly Category[],
  id: string | undefined,
): { category: Category; sub: Subcategory } | null {
  if (!id) return null;
  for (const category of categories) {
    const sub = category.subcategories?.find((s) => s.id === id);
    if (sub) return { category, sub };
  }
  return null;
}

/** True when `subId` is one of `categoryId`'s subcategories. */
export const subcategoryFits = (
  categories: readonly Category[],
  categoryId: CategoryId,
  subId: string | undefined,
): boolean => !!subId && subcategoriesOf(categories, categoryId).some((s) => s.id === subId);

/** The subcategory's name for an entry, or null when it has none (or it was removed). */
export function subcategoryName(
  categories: readonly Category[],
  tx: Pick<Transaction, 'categoryId' | 'subcategoryId'>,
): string | null {
  if (!tx.subcategoryId) return null;
  return (
    subcategoriesOf(categories, tx.categoryId).find((s) => s.id === tx.subcategoryId)?.name ?? null
  );
}

export function subcategoryNameProblem(
  name: string,
  category: Pick<Category, 'subcategories'>,
  ignoreId?: string,
): string | null {
  const n = name.trim();
  if (!n) return tl('Give the subcategory a name');
  if (n.length > MAX_SUBCATEGORY_NAME)
    return tl('Keep it under {0} characters', MAX_SUBCATEGORY_NAME);
  if (
    (category.subcategories ?? []).some(
      (s) => s.id !== ignoreId && s.name.toLowerCase() === n.toLowerCase(),
    )
  )
    return tl('That subcategory is already there');
  return null;
}

/** A new subcategory with an id unique within its category. */
export function makeSubcategory(
  name: string,
  category: Pick<Category, 'id' | 'subcategories'>,
): Subcategory {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sub';
  const base = `${category.id}/${slug}`;
  let id = base;
  for (let i = 2; (category.subcategories ?? []).some((s) => s.id === id); i += 1)
    id = `${base}-${i}`;
  return { id, name: name.trim() };
}

/**
 * A subcategory named by a word (or words) of an entry, for quick add: "coffee 120" with a "Coffee"
 * subcategory under Food & Dining. One in the entry's own category wins; one in another category
 * only when nothing stronger than a built-in word chose the category (your rules win).
 */
export function subcategoryInText(
  text: string,
  categories: readonly Category[],
  current: { categoryId: CategoryId; fromRule: boolean },
): { categoryId: CategoryId; subcategoryId: string } | null {
  const key = ` ${normalizeMerchantKey(text)} `;
  if (key.trim() === '') return null;
  let other: { categoryId: CategoryId; subcategoryId: string } | null = null;
  for (const c of categories) {
    if (c.archived) continue;
    for (const s of c.subcategories ?? []) {
      const name = normalizeMerchantKey(s.name);
      if (!name || !key.includes(` ${name} `)) continue;
      if (c.id === current.categoryId) return { categoryId: c.id, subcategoryId: s.id };
      other ??= { categoryId: c.id, subcategoryId: s.id };
    }
  }
  return current.fromRule ? null : other;
}

export interface SubcategoryRow {
  /** null: entries of the category without a subcategory. */
  id: string | null;
  name: string;
  totalMinor: number;
  count: number;
}

/** A category's spending split by subcategory, largest first, "No subcategory" last. */
export function subcategoryBreakdown(
  list: readonly Pick<Transaction, 'categoryId' | 'subcategoryId' | 'amountMinor'>[],
  category: Category,
): SubcategoryRow[] {
  const subs = category.subcategories ?? [];
  const rows = new Map<string | null, SubcategoryRow>();
  for (const t of list) {
    if (t.categoryId !== category.id) continue;
    const sub = subs.find((s) => s.id === t.subcategoryId);
    const id = sub ? sub.id : null;
    const row = rows.get(id) ?? {
      id,
      name: sub ? sub.name : tl('No subcategory'),
      totalMinor: 0,
      count: 0,
    };
    row.totalMinor += t.amountMinor;
    row.count += 1;
    rows.set(id, row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) ||
      b.totalMinor - a.totalMinor ||
      a.name.localeCompare(b.name),
  );
}
