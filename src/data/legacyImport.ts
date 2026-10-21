import { nextUnusedColor, OTHER_ID } from '../domain/categories';
import { categorise } from '../domain/categoriser';
import { isoFromYMD, isValidYMD, todayISO } from '../domain/dates';
import { parseAmountToMinor } from '../domain/money';
import type { Category, PaymentMethod, Transaction } from '../domain/types';

export type AmountUnit = 'major' | 'minor';

export interface LegacyPreview {
  transactions: Transaction[];
  newCategories: Category[];
  unit: AmountUnit;
  /** True when the unit was guessed, so the UI can offer to flip it. */
  unitDetected: boolean;
  skipped: number;
  warnings: string[];
  firstDate: string | null;
  lastDate: string | null;
  totalMinor: number;
}

export interface LegacyOptions {
  categories: Category[];
  unit?: AmountUnit;
  currency?: string;
  now?: number;
  newId?: () => string;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

const LIST_KEYS = ['transactions', 'expenses', 'entries', 'records', 'items', 'txns', 'data'];
const MINOR_KEYS = ['amountMinor', 'amount_minor', 'minor', 'paise', 'cents'];
const MAJOR_KEYS = ['amount', 'amt', 'value', 'total', 'price'];
const DATE_KEYS = ['date', 'd', 'day', 'when', 'dt', 'timestamp', 'createdAt'];
const MERCHANT_KEYS = ['merchant', 'name', 'title', 'description', 'desc', 'payee', 'store'];
const CATEGORY_KEYS = ['category', 'categoryName', 'cat', 'categoryId'];
const METHOD_KEYS = ['method', 'paymentMethod', 'payment', 'mode', 'paidWith'];
const NOTE_KEYS = ['notes', 'note', 'memo', 'comment'];

/** Values saved as JSON text (as a localStorage dump contains them) are opened up. */
function unwrap(v: unknown): unknown {
  if (typeof v === 'string' && /^\s*[[{]/.test(v)) {
    try {
      return JSON.parse(v) as unknown;
    } catch {
      return v;
    }
  }
  return v;
}

function looksLikeExpense(rec: unknown): boolean {
  return (
    isRec(rec) &&
    firstOf(rec, DATE_KEYS) !== null &&
    (firstOf(rec, MINOR_KEYS) !== null || firstOf(rec, MAJOR_KEYS) !== null)
  );
}

const isExpenseList = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.length > 0 && v.every(isRec) && looksLikeExpense(v[0]);

/**
 * Finds the array of expense records in whatever shape the earlier app exported: a bare array, an
 * object with a list under a familiar key, or a localStorage dump whose values are JSON text.
 */
export function findRecordList(input: unknown, depth = 0): unknown[] | null {
  const json = unwrap(input);
  if (isExpenseList(json)) return json;
  if (!isRec(json) || depth > 3) return null;
  for (const key of LIST_KEYS) {
    const v = unwrap(json[key]);
    if (isExpenseList(v)) return v;
  }
  for (const value of Object.values(json)) {
    const inner = findRecordList(value, depth + 1);
    if (inner) return inner;
  }
  return null;
}

function firstOf(rec: Rec, keys: string[]): { key: string; value: unknown } | null {
  for (const key of keys) {
    if (rec[key] !== undefined && rec[key] !== null && rec[key] !== '') {
      return { key, value: rec[key] };
    }
  }
  return null;
}

function toDate(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return todayISO(new Date(v < 1e11 ? v * 1000 : v));
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidYMD(y, mo, d) ? isoFromYMD(y, mo, d) : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidYMD(y, mo, d) ? isoFromYMD(y, mo, d) : null;
  }
  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) && /\d/.test(v) ? n : null;
  }
  return null;
}

function toMethod(v: unknown): PaymentMethod {
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  if (/upi|gpay|google ?pay|phonepe|paytm|bhim/.test(s)) return 'UPI';
  if (/cash/.test(s)) return 'Cash';
  if (/card|credit|debit/.test(s)) return 'Card';
  if (/bank|neft|imps|rtgs|transfer/.test(s)) return 'Bank transfer';
  return 'Other';
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function parseLegacy(json: unknown, opts: LegacyOptions): LegacyPreview | null {
  const list = findRecordList(json);
  if (!list) return null;

  const idToName = new Map<string, string>();
  const catLists = [isRec(json) ? json.categories : undefined];
  if (isRec(json) && isRec(json.data)) catLists.push(json.data.categories);
  for (const cats of catLists) {
    if (!Array.isArray(cats)) continue;
    for (const c of cats) {
      if (isRec(c) && typeof c.id === 'string' && typeof c.name === 'string') {
        idToName.set(c.id, c.name);
      }
    }
  }

  const usedMinorKey = list.some((r) => isRec(r) && firstOf(r, MINOR_KEYS));
  const majorValues = list.flatMap((r) => {
    const hit = isRec(r) ? firstOf(r, MAJOR_KEYS) : null;
    const n = hit ? toNumber(hit.value) : null;
    return n === null ? [] : [n];
  });

  let unit: AmountUnit = 'major';
  let unitDetected = false;
  if (opts.unit) unit = opts.unit;
  else if (usedMinorKey) unit = 'minor';
  else if (majorValues.length > 0) {
    const mean = majorValues.reduce((a, b) => a + b, 0) / majorValues.length;
    if (majorValues.every(Number.isInteger) && mean >= 50_000) unit = 'minor';
    unitDetected = true;
  }

  const now = opts.now ?? Date.now();
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const warnings: string[] = [];
  const known = [...opts.categories];
  const newCategories: Category[] = [];
  const transactions: Transaction[] = [];
  let skipped = 0;

  const resolveCategory = (rec: Rec): string => {
    const hit = firstOf(rec, CATEGORY_KEYS);
    let name = '';
    if (hit) {
      if (typeof hit.value === 'string') name = idToName.get(hit.value) ?? hit.value;
      else if (isRec(hit.value) && typeof hit.value.name === 'string') name = hit.value.name;
    }
    const clean = name.trim();
    if (!clean) return OTHER_ID;
    const exact = known.find((c) => c.name.toLowerCase() === clean.toLowerCase() || c.id === clean);
    if (exact) return exact.id;
    const guess = categorise(clean);
    if (guess.confidence !== 'none') return guess.categoryId;
    const created: Category = {
      id: `legacy-${slug(clean) || 'category'}`,
      name: clean,
      color: nextUnusedColor(known.map((c) => c.color)),
      order: known.length,
    };
    known.push(created);
    newCategories.push(created);
    return created.id;
  };

  for (const item of list) {
    if (!isRec(item) || item.deleted === true) {
      skipped += 1;
      continue;
    }
    const dateHit = firstOf(item, DATE_KEYS);
    const date = dateHit ? toDate(dateHit.value) : null;
    let amountMinor: number | null = null;
    const minorHit = firstOf(item, MINOR_KEYS);
    const majorHit = firstOf(item, MAJOR_KEYS);
    if (minorHit) {
      const n = toNumber(minorHit.value);
      amountMinor = n === null ? null : Math.round(n);
    } else if (majorHit) {
      const raw = majorHit.value;
      const n = toNumber(raw);
      if (n !== null) {
        if (unit === 'minor') amountMinor = Math.round(n);
        else amountMinor = typeof raw === 'string' ? parseAmountToMinor(raw.replace(/[^0-9.]/g, '')) : Math.round(n * 100);
      }
    }
    if (!date || amountMinor === null || amountMinor <= 0) {
      skipped += 1;
      continue;
    }
    const merchantHit = firstOf(item, MERCHANT_KEYS);
    const noteHit = firstOf(item, NOTE_KEYS);
    const tagsRaw = item.tags;
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.filter((t): t is string => typeof t === 'string')
      : typeof tagsRaw === 'string'
        ? tagsRaw.split(/[,\s]+/).filter(Boolean).map((t) => t.replace(/^#/, ''))
        : [];
    transactions.push({
      id: newId(),
      date,
      amountMinor,
      currency: opts.currency ?? 'INR',
      merchant: merchantHit ? String(merchantHit.value).trim() || 'Expense' : 'Expense',
      categoryId: resolveCategory(item),
      method: toMethod(firstOf(item, METHOD_KEYS)?.value),
      notes: noteHit ? String(noteHit.value) : '',
      tags,
      raw: typeof item.raw === 'string' ? item.raw : undefined,
      source: 'legacy',
      createdAt: now,
      updatedAt: now,
    });
  }

  if (skipped > 0) warnings.push(`${skipped} record(s) had no usable date or amount and were skipped.`);
  const dates = transactions.map((t) => t.date).sort();
  return {
    transactions,
    newCategories,
    unit,
    unitDetected,
    skipped,
    warnings,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    totalMinor: transactions.reduce((sum, t) => sum + t.amountMinor, 0),
  };
}

/**
 * Looks for the earlier app's data in this browser (same origin). Key names are not assumed: any value
 * that holds a list of dated, priced records counts. Ledger v2's own keys are skipped.
 */
export function readLegacyFromStorage(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
): unknown | null {
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key || key === 'ledger.boot' || key === 'ledger.legacyDismissed') continue;
    try {
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? 'null');
      if (findRecordList(parsed)) return parsed;
    } catch {
      /* not JSON, ignore */
    }
  }
  return null;
}
