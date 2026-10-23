import { categorise, normalizeMerchantKey } from './categoriser';
import { categoryById, nextUnusedColor } from './categories';
import { unsafeText } from './csv';
import { isoFromYMD, isValidYMD } from './dates';
import { parseAmountToMinor } from './money';
import { parseTags } from './tags';
import {
  PAYMENT_METHODS,
  type Category,
  type ISODate,
  type PaymentMethod,
  type Transaction,
} from './types';
import { tl } from './i18n';

export const CSV_FIELDS = [
  'date',
  'amount',
  'merchant',
  'category',
  'method',
  'tags',
  'notes',
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];
/** Column index for each field, or -1 when the file has no such column. */
export type Mapping = Record<CsvField, number>;
export type DateOrder = 'dmy' | 'mdy';

const HEADER_HINTS: Record<CsvField, RegExp> = {
  date: /date|day|when|posted/i,
  amount: /amount|amt|debit|withdraw|spent|value|price|inr|rs\b|₹/i,
  merchant: /merchant|payee|description|narration|particular|detail|name|item|what|for/i,
  category: /categor|head|type/i,
  method: /method|mode|payment|paid|via/i,
  tags: /tag|label/i,
  notes: /note|remark|memo|comment/i,
};

/** A best guess at which column holds which field, from the header row. Each column is used once. */
export function guessMapping(headers: readonly string[]): Mapping {
  const used = new Set<number>();
  const mapping = Object.fromEntries(CSV_FIELDS.map((f) => [f, -1])) as Mapping;
  for (const field of CSV_FIELDS) {
    const index = headers.findIndex((h, i) => !used.has(i) && HEADER_HINTS[field].test(h.trim()));
    if (index >= 0) {
      mapping[field] = index;
      used.add(index);
    }
  }
  return mapping;
}

const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const MONTH_NUM: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/** Reads 2026-10-18, 18/10/2026, 18-10-26, 18.10.2026, 18 Oct 2026, Oct 18, 2026, 18-Oct-26. */
export function parseDateFlexible(raw: string, order: DateOrder = 'dmy'): ISODate | null {
  const s = raw.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidYMD(y, mo, d) ? isoFromYMD(y, mo, d) : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(Number(m[3]));
    const [d, mo] = order === 'dmy' ? [a, b] : [b, a];
    return isValidYMD(y, mo, d) ? isoFromYMD(y, mo, d) : null;
  }
  m = /^(\d{1,2})[-\s]([a-z]{3,9})[-\s](\d{2,4})\b/i.exec(s);
  if (m && MONTH.test(m[2]!)) {
    const mo = MONTH_NUM[m[2]!.slice(0, 3).toLowerCase()]!;
    const d = Number(m[1]);
    const y = fullYear(Number(m[3]));
    return isValidYMD(y, mo, d) ? isoFromYMD(y, mo, d) : null;
  }
  m = /^([a-z]{3,9})\s(\d{1,2})\s(\d{2,4})\b/i.exec(s);
  if (m && MONTH.test(m[1]!)) {
    const mo = MONTH_NUM[m[1]!.slice(0, 3).toLowerCase()]!;
    const d = Number(m[2]);
    const y = fullYear(Number(m[3]));
    return isValidYMD(y, mo, d) ? isoFromYMD(y, mo, d) : null;
  }
  return null;
}

/** Day/month unless a value can only be month/day (second part above 12). */
export function detectDateOrder(values: readonly string[]): DateOrder {
  let dmy = false;
  let mdy = false;
  for (const v of values) {
    const m = /^\s*(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(v);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  return mdy && !dmy ? 'mdy' : 'dmy';
}

/** "₹1,200.50", "Rs. 1200", "INR 99", "(500)" → minor units; negatives come back negative. */
export function parseCsvAmount(raw: string): number | null {
  let s = raw.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/₹|inr|rs\.?|\$|€|£/gi, '').replace(/\s/g, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (/(cr)$/i.test(s)) {
    negative = true;
    s = s.replace(/cr$/i, '');
  }
  s = s.replace(/dr$/i, '');
  const minor = parseAmountToMinor(s);
  if (minor === null) return null;
  return negative ? -minor : minor;
}

const METHOD_HINTS: Array<[RegExp, PaymentMethod]> = [
  [/upi|gpay|google pay|phonepe|paytm|bhim/i, 'UPI'],
  [/cash/i, 'Cash'],
  [/card|credit|debit|visa|master|rupay/i, 'Card'],
  [/neft|imps|rtgs|bank|transfer|net ?banking/i, 'Bank transfer'],
];

export function parseMethod(raw: string, fallback: PaymentMethod): PaymentMethod {
  const exact = PAYMENT_METHODS.find((m) => m.toLowerCase() === raw.trim().toLowerCase());
  if (exact) return exact;
  if (!raw.trim()) return fallback;
  return METHOD_HINTS.find(([re]) => re.test(raw))?.[1] ?? 'Other';
}

export interface ImportContext {
  categories: readonly Category[];
  rules: Record<string, string>;
  existing: readonly Transaction[];
  currency: string;
  lastMethod: PaymentMethod;
  now: number;
  newId: () => string;
  dateOrder: DateOrder;
}

export interface ImportPlan {
  transactions: Transaction[];
  newCategories: Category[];
  /** Rows matching an entry already in Ledger (same date, amount and merchant). */
  duplicates: number;
  /** Money coming in (negative or credit amounts); expenses only are imported. */
  skippedIncome: number;
  errors: Array<{ row: number; message: string }>;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'category';

/** Turns mapped CSV rows into new entries. Nothing is written; the caller runs one undoable command. */
export function planCsvImport(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  mapping: Mapping,
  ctx: ImportContext,
): ImportPlan {
  const plan: ImportPlan = {
    transactions: [],
    newCategories: [],
    duplicates: 0,
    skippedIncome: 0,
    errors: [],
  };
  const seen = new Set(
    ctx.existing.map((t) => `${t.date}|${t.amountMinor}|${normalizeMerchantKey(t.merchant)}`),
  );
  const categories = [...ctx.categories];
  const cell = (r: ReadonlyArray<string>, f: CsvField) =>
    mapping[f] >= 0 ? unsafeText((r[mapping[f]] ?? '').trim()) : '';

  rows.forEach((r, i) => {
    const rowNo = i + 2; // 1-based, after the header row
    const date = parseDateFlexible(cell(r, 'date'), ctx.dateOrder);
    if (!date) {
      plan.errors.push({
        row: rowNo,
        message: tl('Row {0}: the date "{1}" is not readable', rowNo, cell(r, 'date')),
      });
      return;
    }
    const amount = parseCsvAmount(cell(r, 'amount'));
    if (amount === null || amount === 0) {
      plan.errors.push({ row: rowNo, message: tl('Row {0}: no amount', rowNo) });
      return;
    }
    if (amount < 0) {
      plan.skippedIncome += 1;
      return;
    }
    const merchant = cell(r, 'merchant') || 'Untitled';
    const key = `${date}|${amount}|${normalizeMerchantKey(merchant)}`;
    if (seen.has(key)) {
      plan.duplicates += 1;
      return;
    }

    const categoryName = cell(r, 'category');
    let categoryId: string;
    if (categoryName) {
      const found = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
      if (found) categoryId = found.id;
      else {
        let id = `c-${slug(categoryName)}`;
        while (categoryById(categories, id)) id = `${id}-x`;
        const created: Category = {
          id,
          name: categoryName,
          color: nextUnusedColor(categories.map((c) => c.color)),
          order: Math.max(-1, ...categories.map((c) => c.order)) + 1,
        };
        categories.push(created);
        plan.newCategories.push(created);
        categoryId = id;
      }
    } else categoryId = categorise(merchant, ctx.rules).categoryId;

    plan.transactions.push({
      id: ctx.newId(),
      date,
      amountMinor: amount,
      currency: ctx.currency,
      merchant,
      categoryId,
      method: parseMethod(cell(r, 'method'), ctx.lastMethod),
      notes: cell(r, 'notes'),
      tags: parseTags(cell(r, 'tags').replace(/;/g, ',')),
      source: 'import',
      unsure: !categoryName && categorise(merchant, ctx.rules).confidence === 'none',
      createdAt: ctx.now + i,
      updatedAt: ctx.now + i,
    });
  });
  return plan;
}

// Kept here too, so the importer and its tests read exports from one place.
export { exportHeaders, exportRows } from './csvExport';
