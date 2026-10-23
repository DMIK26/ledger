import { categoryById } from './categories';
import { minorToPlain } from './money';
import type { Category, Transaction } from './types';

/**
 * CSV export (split from csvImport in Drop 12 so Transactions and Reports do not load the importer).
 * The columns read back with planCsvImport unchanged.
 */
export const exportHeaders = (symbol: string) => [
  'Date',
  'Merchant',
  `Amount (${symbol})`,
  'Currency',
  'Category',
  'Method',
  'Tags',
  'Notes',
];

/** Rows for a CSV export, header first. Reads back with planCsvImport unchanged. */
export function exportRows(
  list: readonly Transaction[],
  categories: readonly Category[],
  safe: (s: string) => string,
  symbol = '₹',
): string[][] {
  return [
    exportHeaders(symbol),
    ...list.map((t) => [
      t.date,
      safe(t.merchant),
      minorToPlain(t.amountMinor),
      t.currency,
      safe(categoryById(categories, t.categoryId)?.name ?? 'Other'),
      t.method,
      safe(t.tags.join('; ')),
      safe(t.notes),
    ]),
  ];
}
