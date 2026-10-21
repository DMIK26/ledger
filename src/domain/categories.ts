import type { Category } from './types';

/** Ten distinguishable colours. No two default categories share one. Gray is reserved for Other. */
export const CATEGORY_PALETTE = [
  '#d97757', '#6a9bcc', '#788c5d', '#d4a27f', '#c46686',
  '#4a6f95', '#a8553a', '#9a8fc4', '#4f8f86', '#b0aea5',
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
