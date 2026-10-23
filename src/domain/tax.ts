import { categoryById } from './categories';
import { minorToPlain } from './money';
import type { Category, ISODate, Transaction } from './types';

/**
 * Tax summary (Drop 12): entries tagged with an income-tax deduction, totalled for a financial year
 * against the usual old-regime limits. A guide, not tax advice: the names are the familiar ones from
 * the 1961 Act, which the Income-tax Act, 2025 renumbers from April 2026 (80C is section 123, 80D is
 * section 126), and most of these count only under the old regime.
 */

export interface TaxSection {
  id: string;
  /** What usually goes in it. */
  what: string;
  /** The usual yearly limit, in paise; null when there is no fixed one. */
  limitMinor: number | null;
  /** Said under the figures; never an amount, so privacy mode has nothing to hide. */
  note?: string;
}

export const TAX_SECTIONS: TaxSection[] = [
  {
    id: '80C',
    what: 'PF, PPF, ELSS, life insurance, tuition fees, home loan principal',
    limitMinor: 1_50_000_00,
  },
  { id: '80CCD(1B)', what: 'NPS, over and above 80C', limitMinor: 50_000_00 },
  {
    id: '80D',
    what: 'Health insurance and check-ups',
    limitMinor: 25_000_00,
    note: 'Higher for senior citizens; insurance for parents has its own limit.',
  },
  { id: '80E', what: 'Interest on an education loan', limitMinor: null },
  {
    id: '80G',
    what: 'Donations to approved charities',
    limitMinor: null,
    note: 'Half or all of a donation counts, depending on the charity.',
  },
  { id: '24(b)', what: 'Interest on a home loan you live in', limitMinor: 2_00_000_00 },
  { id: 'Other', what: 'Any other deduction', limitMinor: null },
];

export const taxSectionById = (id: string | undefined): TaxSection | undefined =>
  TAX_SECTIONS.find((s) => s.id === id);

/** A typed word as a section: "80c", "80CCD(1B)", "80ccd1b", "24b", "24(b)". */
export function taxSectionFromWord(word: string): string | null {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w === '80c') return '80C';
  if (w === '80ccd' || w === '80ccd1b') return '80CCD(1B)';
  if (w === '80d') return '80D';
  if (w === '80e') return '80E';
  if (w === '80g') return '80G';
  if (w === '24b') return '24(b)';
  return null;
}

export interface TaxRow {
  section: TaxSection;
  totalMinor: number;
  /** What counts: the total, or the limit when the total is over it. */
  countedMinor: number;
  overMinor: number;
  entries: Transaction[];
}

export interface TaxSummary {
  start: ISODate;
  end: ISODate;
  rows: TaxRow[];
  countedMinor: number;
  entries: number;
}

/** Sections with entries in the year, in the order of TAX_SECTIONS. */
export function taxSummary(
  transactions: readonly Transaction[],
  range: { start: ISODate; end: ISODate },
): TaxSummary {
  const rows: TaxRow[] = [];
  for (const section of TAX_SECTIONS) {
    const entries = transactions
      .filter((t) => t.taxSection === section.id && t.date >= range.start && t.date <= range.end)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (entries.length === 0) continue;
    const totalMinor = entries.reduce((s, t) => s + t.amountMinor, 0);
    const countedMinor =
      section.limitMinor === null ? totalMinor : Math.min(totalMinor, section.limitMinor);
    rows.push({ section, totalMinor, countedMinor, overMinor: totalMinor - countedMinor, entries });
  }
  return {
    start: range.start,
    end: range.end,
    rows,
    countedMinor: rows.reduce((s, r) => s + r.countedMinor, 0),
    entries: rows.reduce((s, r) => s + r.entries.length, 0),
  };
}

/** The summary as CSV rows (header first): every entry, then a total line per section. */
export function taxCsvRows(
  summary: TaxSummary,
  categories: readonly Category[],
  safe: (s: string) => string,
): string[][] {
  const out: string[][] = [['Section', 'Date', 'What', 'Category', 'Amount', 'Notes']];
  for (const r of summary.rows) {
    for (const t of r.entries)
      out.push([
        r.section.id,
        t.date,
        safe(t.merchant),
        safe(categoryById(categories, t.categoryId)?.name ?? 'Other'),
        minorToPlain(t.amountMinor),
        safe(t.notes),
      ]);
    out.push([
      r.section.id,
      '',
      `Total for ${r.section.id}`,
      '',
      minorToPlain(r.totalMinor),
      r.section.limitMinor === null
        ? 'No fixed limit'
        : `Limit ${minorToPlain(r.section.limitMinor)}; counts ${minorToPlain(r.countedMinor)}`,
    ]);
  }
  return out;
}
