import type { Category } from './types';

/** Ten distinguishable colours. No two default categories share one. Gray is reserved for Other. */
export const CATEGORY_PALETTE = [
  '#d97757',
  '#6a9bcc',
  '#788c5d',
  '#d4a27f',
  '#c46686',
  '#4a6f95',
  '#a8553a',
  '#9a8fc4',
  '#4f8f86',
  '#b0aea5',
] as const;

export const OTHER_ID = 'other';

const make = (id: string, name: string, order: number): Category => ({
  id,
  name,
  order,
  color: CATEGORY_PALETTE[order] ?? CATEGORY_PALETTE[9],
});

export const DEFAULT_CATEGORIES: Category[] = [
  make('housing', 'Housing & Utilities', 0),
  make('food', 'Food & Dining', 1),
  make('groceries', 'Groceries', 2),
  make('shopping', 'Shopping & Essentials', 3),
  make('health', 'Health & Wellness', 4),
  make('transport', 'Transport & Travel', 5),
  make('entertainment', 'Entertainment & Culture', 6),
  make('education', 'Education', 7),
  make('business', 'Business', 8),
  make(OTHER_ID, 'Other', 9),
];

/** Next palette colour not already used. Past ten the palette repeats (the UI adds a hatch). */
export function nextUnusedColor(used: readonly string[]): string {
  const free = CATEGORY_PALETTE.slice(0, 9).find((c) => !used.includes(c));
  return free ?? CATEGORY_PALETTE[used.length % 9]!;
}

export function categoryById(categories: readonly Category[], id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

const DEFAULT_IDS = new Set(DEFAULT_CATEGORIES.map((c) => c.id));

/** The ten default categories keep their names and cannot be deleted; they can be recoloured and moved. */
export const isDefaultCategory = (id: string): boolean => DEFAULT_IDS.has(id);

export const MAX_CATEGORY_NAME = 40;

/** Returns a reason the name cannot be used, or null when it is fine. */
export function categoryNameProblem(
  name: string,
  categories: readonly Category[],
  ignoreId?: string,
): string | null {
  const n = name.trim();
  if (!n) return 'Give the category a name';
  if (n.length > MAX_CATEGORY_NAME) return `Keep it under ${MAX_CATEGORY_NAME} characters`;
  if (categories.some((c) => c.id !== ignoreId && c.name.toLowerCase() === n.toLowerCase()))
    return 'There is already a category with that name';
  return null;
}

/** A new category at the end of the list, with the first unused colour and a unique id. */
export function makeCategory(name: string, categories: readonly Category[]): Category {
  const base = `c-${
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'category'
  }`;
  let id = base;
  for (let i = 2; categories.some((c) => c.id === id); i += 1) id = `${base}-${i}`;
  return {
    id,
    name: name.trim(),
    color: nextUnusedColor(categories.map((c) => c.color)),
    order: Math.max(-1, ...categories.map((c) => c.order)) + 1,
  };
}

/** Recolours one category. If another already uses that colour, the two swap, so colours stay unique. */
export function recolor(categories: readonly Category[], id: string, color: string): Category[] {
  const target = categories.find((c) => c.id === id);
  if (!target || target.color === color) return [...categories];
  return categories.map((c) =>
    c.id === id ? { ...c, color } : c.color === color ? { ...c, color: target.color } : c,
  );
}

/** Moves a category to a new position (0-based) and renumbers `order` 0..n-1. */
export function reorder(categories: readonly Category[], id: string, toIndex: number): Category[] {
  const sorted = [...categories].sort((a, b) => a.order - b.order);
  const from = sorted.findIndex((c) => c.id === id);
  if (from < 0) return sorted;
  const [moved] = sorted.splice(from, 1);
  sorted.splice(Math.max(0, Math.min(sorted.length, toIndex)), 0, moved!);
  return sorted.map((c, order) => ({ ...c, order }));
}
