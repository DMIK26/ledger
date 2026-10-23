import { weekStart } from './calendar';
import { normalizeMerchantKey } from './categoriser';
import {
  addDays,
  daysInMonth,
  fmtDate,
  fyOf,
  isoFromYMD,
  isValidYMD,
  monthBounds,
  monthKey,
  MONTHS,
  monthName,
  parseISO,
  shiftMonthKey,
} from './dates';
import { parseAmountToMinor } from './money';
import { lastDays, lastMonthsRange } from './periods';
import { normalizeTag } from './tags';
import { taxSectionFromWord } from './tax';
import type { Category, ISODate, PaymentMethod, Transaction } from './types';
import { tl } from './i18n';

/**
 * Plain-words search (Drop 12): "food last month over 500 upi". Periods, amounts, methods, categories,
 * subcategories, tags, people, trips, tax sections and a few flags are understood; every other word
 * must appear in the merchant, notes, typed text or tags. Within one kind any match counts (two
 * categories means either); across kinds all must hold.
 */

export type SearchFlag = 'tax' | 'warranty' | 'receipt' | 'split' | 'unsure';

export type AmountPart =
  | { kind: 'over' | 'under' | 'atLeast' | 'atMost' | 'exact'; minor: number }
  | { kind: 'between'; minor: number; to: number };

export interface SearchQuery {
  period: { start: ISODate; end: ISODate; label: string } | null;
  amount: AmountPart | null;
  methods: PaymentMethod[];
  categoryIds: string[];
  subcategoryIds: string[];
  tags: string[];
  /** Lowercase names; '' means you (nobody named). */
  forWhom: string[];
  projectIds: string[];
  taxSections: string[];
  flags: SearchFlag[];
  words: string[];
}

export interface SearchContext {
  today: ISODate;
  fyStart: number;
  categories: readonly Category[];
  projects: readonly { id: string; name: string }[];
  /** Names used for "for whom". */
  people: readonly string[];
}

const METHODS: Record<string, PaymentMethod> = {
  upi: 'UPI',
  gpay: 'UPI',
  googlepay: 'UPI',
  phonepe: 'UPI',
  paytm: 'UPI',
  bhim: 'UPI',
  cash: 'Cash',
  card: 'Card',
  cards: 'Card',
  credit: 'Card',
  debit: 'Card',
  visa: 'Card',
  mastercard: 'Card',
  rupay: 'Card',
  bank: 'Bank transfer',
  neft: 'Bank transfer',
  imps: 'Bank transfer',
  rtgs: 'Bank transfer',
  transfer: 'Bank transfer',
};

const FLAGS: Record<string, SearchFlag> = {
  tax: 'tax',
  taxes: 'tax',
  deduction: 'tax',
  deductions: 'tax',
  warranty: 'warranty',
  warranties: 'warranty',
  guarantee: 'warranty',
  receipt: 'receipt',
  receipts: 'receipt',
  split: 'split',
  splits: 'split',
  shared: 'split',
  unsure: 'unsure',
};

const STOP = new Set([
  'a',
  'an',
  'the',
  'in',
  'on',
  'at',
  'of',
  'and',
  'or',
  'with',
  'by',
  'via',
  'using',
  'paid',
  'pay',
  'spent',
  'spend',
  'spending',
  'expense',
  'expenses',
  'entry',
  'entries',
  'show',
  'me',
  'my',
  'all',
  'than',
  'for',
  'during',
  'within',
  'what',
  'how',
  'much',
  'did',
  'i',
]);

const MONTH_WORDS: Record<string, number> = {};
MONTHS.forEach((name, i) => {
  const n = name.toLowerCase();
  MONTH_WORDS[n] = i + 1;
  MONTH_WORDS[n.slice(0, 3)] = i + 1;
});
MONTH_WORDS.sept = 9;

const AMOUNT = /^₹?(\d[\d,]*(?:\.\d+)?)(k|l|lakh|lakhs)?$/;

/** "500", "₹1,200", "1.5k", "2l" as paise; null when it is not an amount. */
function amountOf(token: string | undefined): number | null {
  if (!token) return null;
  const m = AMOUNT.exec(token);
  if (!m) return null;
  const base = parseAmountToMinor(m[1]!);
  if (base === null) return null;
  const times = m[2] === 'k' ? 1000 : m[2] ? 100_000 : 1;
  return base * times;
}

const isInt = (t: string | undefined): t is string => !!t && /^\d+$/.test(t);
const isYear = (t: string | undefined): t is string => !!t && /^(19|20)\d{2}$/.test(t);

/** Lowercase, currency words joined to their numbers, brackets in tax sections dropped. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[“”"]/g, ' ')
    .replace(/\(([a-z0-9]+)\)/g, '$1')
    .replace(/\b(?:rs\.?|inr)\s*(?=\d)/g, '₹')
    .replace(/₹\s+(?=\d)/g, '₹')
    .replace(/(\d)\s*(?:rs|rupees|inr)\b/g, '$1')
    .replace(/>\s*/g, ' over ')
    .replace(/<\s*/g, ' under ')
    .replace(/,(?!\d)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const empty = (): SearchQuery => ({
  period: null,
  amount: null,
  methods: [],
  categoryIds: [],
  subcategoryIds: [],
  tags: [],
  forWhom: [],
  projectIds: [],
  taxSections: [],
  flags: [],
  words: [],
});

const push = <T>(list: T[], v: T) => {
  if (!list.includes(v)) list.push(v);
};

/** Word matches a name word, allowing a plural on either side ("grocery", "groceries"). */
const sameWord = (a: string, b: string): boolean =>
  a === b ||
  `${a}s` === b ||
  `${b}s` === a ||
  (a.endsWith('y') && `${a.slice(0, -1)}ies` === b) ||
  (b.endsWith('y') && `${b.slice(0, -1)}ies` === a);

export function parseSearch(text: string, ctx: SearchContext): SearchQuery {
  const q = empty();
  const toks = tokenize(text);
  const { today } = ctx;
  const year = parseISO(today)!.y;

  const names = (list: readonly { id: string; name: string }[]) =>
    list
      .map((x) => ({ id: x.id, words: normalizeMerchantKey(x.name).split(' ').filter(Boolean) }))
      .filter((x) => x.words.length > 0)
      .sort((a, b) => b.words.length - a.words.length);
  const projectNames = names(ctx.projects);
  const subNames = names(
    ctx.categories.flatMap((c) => (c.subcategories ?? []).map((s) => ({ id: s.id, name: s.name }))),
  );
  const catNames = names(ctx.categories);
  const catWords = ctx.categories.map((c) => ({
    id: c.id,
    words: normalizeMerchantKey(c.name)
      .split(' ')
      .filter((w) => w.length >= 3 && w !== 'and'),
  }));
  const people = ctx.people.map((p) => p.trim().toLowerCase()).filter(Boolean);

  const matchesAt = (i: number, words: readonly string[]) =>
    words.every((w, k) => toks[i + k] !== undefined && sameWord(toks[i + k]!, w));

  const setPeriod = (start: ISODate, end: ISODate, label: string) => {
    q.period = { start, end, label };
  };
  const monthRange = (y: number, m: number) => ({
    start: isoFromYMD(y, m, 1),
    end: isoFromYMD(y, m, daysInMonth(y, m)),
  });

  let i = 0;
  while (i < toks.length) {
    const t = toks[i]!;
    const n1 = toks[i + 1];
    const n2 = toks[i + 2];
    const n3 = toks[i + 3];

    // Periods.
    if (t === 'today') {
      setPeriod(today, today, tl('Today'));
      i += 1;
      continue;
    }
    if (t === 'yesterday') {
      const d = addDays(today, -1);
      setPeriod(d, d, tl('Yesterday'));
      i += 1;
      continue;
    }
    if ((t === 'this' || t === 'last' || t === 'previous') && n1) {
      const last = t !== 'this';
      const unit = n1 === 'financial' && n2 === 'year' ? 'fy' : n1;
      const used = n1 === 'financial' && n2 === 'year' ? 3 : 2;
      if (unit === 'week' || unit === 'month' || unit === 'year' || unit === 'fy') {
        if (unit === 'week') {
          const start = addDays(weekStart(today), last ? -7 : 0);
          setPeriod(start, addDays(start, 6), last ? tl('Last week') : tl('This week'));
        } else if (unit === 'month') {
          const b = monthBounds(shiftMonthKey(monthKey(today), last ? -1 : 0));
          setPeriod(b.start, b.end, last ? tl('Last month') : tl('This month'));
        } else if (unit === 'year') {
          const y = last ? year - 1 : year;
          setPeriod(isoFromYMD(y, 1, 1), isoFromYMD(y, 12, 31), last ? String(y) : tl('This year'));
        } else {
          const now = fyOf(today, ctx.fyStart);
          const fy = last ? fyOf(addDays(now.start, -1), ctx.fyStart) : now;
          setPeriod(fy.start, fy.end, fy.label);
        }
        i += used;
        continue;
      }
    }
    if ((t === 'last' || t === 'past') && isInt(n1) && n2) {
      const n = Number(n1);
      const unit = n2.replace(/s$/, '');
      if (n > 0 && n <= 3650 && (unit === 'day' || unit === 'week' || unit === 'month')) {
        const r =
          unit === 'month'
            ? lastMonthsRange(n, today)
            : lastDays(unit === 'week' ? 7 * n : n, today);
        setPeriod(r.start, r.end, tl('Last {0} {1}', n, n === 1 ? unit : `${unit}s`));
        i += 3;
        continue;
      }
    }
    const dayMonth = (d: number, m: number, y?: number): ISODate | null => {
      let yy = y ?? year;
      if (!isValidYMD(yy, m, d)) return null;
      if (y === undefined && isoFromYMD(yy, m, d) > addDays(today, 7)) yy -= 1;
      return isValidYMD(yy, m, d) ? isoFromYMD(yy, m, d) : null;
    };
    if (MONTH_WORDS[t]) {
      const m = MONTH_WORDS[t]!;
      if (isInt(n1) && Number(n1) >= 1 && Number(n1) <= 31) {
        const date = dayMonth(Number(n1), m, isYear(n2) ? Number(n2) : undefined);
        if (date) {
          setPeriod(date, date, fmtDate(date));
          i += isYear(n2) ? 3 : 2;
          continue;
        }
      }
      const y = isYear(n1) ? Number(n1) : m <= parseISO(today)!.m ? year : year - 1;
      const r = monthRange(y, m);
      setPeriod(r.start, r.end, `${monthName(m)} ${y}`);
      i += isYear(n1) ? 2 : 1;
      continue;
    }
    if (isInt(t) && n1 && MONTH_WORDS[n1] && Number(t) >= 1 && Number(t) <= 31) {
      const date = dayMonth(Number(t), MONTH_WORDS[n1]!, isYear(n2) ? Number(n2) : undefined);
      if (date) {
        setPeriod(date, date, fmtDate(date));
        i += isYear(n2) ? 3 : 2;
        continue;
      }
    }
    if (t === 'in' && isYear(n1)) {
      const y = Number(n1);
      setPeriod(isoFromYMD(y, 1, 1), isoFromYMD(y, 12, 31), n1);
      i += 2;
      continue;
    }

    // Tax sections come before amounts: "80c" is not a number.
    const section = taxSectionFromWord(t);
    if (section) {
      push(q.taxSections, section);
      i += 1;
      continue;
    }

    // Amounts.
    const over = t === 'over' || t === 'above' || t === 'min' || t === 'minimum';
    if (over && amountOf(n1) !== null) {
      q.amount = {
        kind: t === 'min' || t === 'minimum' ? 'atLeast' : 'over',
        minor: amountOf(n1)!,
      };
      i += 2;
      continue;
    }
    if (
      (t === 'under' || t === 'below' || t === 'max' || t === 'maximum' || t === 'upto') &&
      amountOf(n1) !== null
    ) {
      q.amount = {
        kind: t === 'under' || t === 'below' ? 'under' : 'atMost',
        minor: amountOf(n1)!,
      };
      i += 2;
      continue;
    }
    if (
      (t === 'more' || t === 'greater' || t === 'less' || t === 'fewer') &&
      n1 === 'than' &&
      amountOf(n2) !== null
    ) {
      q.amount = { kind: t === 'more' || t === 'greater' ? 'over' : 'under', minor: amountOf(n2)! };
      i += 3;
      continue;
    }
    if (
      (t === 'at' || t === 'up') &&
      (n1 === 'least' || n1 === 'most' || n1 === 'to') &&
      amountOf(n2) !== null
    ) {
      q.amount = { kind: n1 === 'least' ? 'atLeast' : 'atMost', minor: amountOf(n2)! };
      i += 3;
      continue;
    }
    if (
      t === 'between' &&
      amountOf(n1) !== null &&
      (n2 === 'and' || n2 === 'to' || n2 === '-') &&
      amountOf(n3) !== null
    ) {
      const a = amountOf(n1)!;
      const b = amountOf(n3)!;
      q.amount = { kind: 'between', minor: Math.min(a, b), to: Math.max(a, b) };
      i += 4;
      continue;
    }
    if (amountOf(t) !== null && (n1 === 'to' || n1 === '-') && amountOf(n2) !== null) {
      const a = amountOf(t)!;
      const b = amountOf(n2)!;
      q.amount = { kind: 'between', minor: Math.min(a, b), to: Math.max(a, b) };
      i += 3;
      continue;
    }
    const dash = /^(₹?\d[\d,.]*k?)-(₹?\d[\d,.]*k?)$/.exec(t);
    if (dash && amountOf(dash[1]) !== null && amountOf(dash[2]) !== null) {
      const a = amountOf(dash[1])!;
      const b = amountOf(dash[2])!;
      q.amount = { kind: 'between', minor: Math.min(a, b), to: Math.max(a, b) };
      i += 1;
      continue;
    }

    // Tags.
    if (t.startsWith('#') && normalizeTag(t)) {
      push(q.tags, normalizeTag(t));
      i += 1;
      continue;
    }
    if ((t === 'tag' || t === 'tagged') && n1 && normalizeTag(n1)) {
      push(q.tags, normalizeTag(n1));
      i += 2;
      continue;
    }

    // People: "for amma", "for me".
    if (t === 'for' && n1) {
      if (n1 === 'me' || n1 === 'myself') {
        push(q.forWhom, '');
        i += 2;
        continue;
      }
      const two = n2 ? `${n1} ${n2}` : '';
      if (two && people.includes(two)) {
        push(q.forWhom, two);
        i += 3;
        continue;
      }
      if (people.includes(n1)) {
        push(q.forWhom, n1);
        i += 2;
        continue;
      }
    }

    if (METHODS[t]) {
      push(q.methods, METHODS[t]!);
      i += 1;
      continue;
    }
    if (FLAGS[t]) {
      push(q.flags, FLAGS[t]!);
      i += 1;
      continue;
    }

    // Trips and projects, then subcategories, then categories by their whole name or one word of it.
    const project = projectNames.find((p) => matchesAt(i, p.words));
    if (project) {
      push(q.projectIds, project.id);
      i += project.words.length;
      continue;
    }
    const sub = subNames.find((s) => matchesAt(i, s.words));
    if (sub) {
      push(q.subcategoryIds, sub.id);
      i += sub.words.length;
      continue;
    }
    const cat = catNames.find((c) => c.words.length > 1 && matchesAt(i, c.words));
    if (cat) {
      push(q.categoryIds, cat.id);
      i += cat.words.length;
      continue;
    }
    const byWord = catWords.filter((c) => c.words.some((w) => sameWord(t, w)));
    if (byWord.length > 0) {
      for (const c of byWord) push(q.categoryIds, c.id);
      i += 1;
      continue;
    }

    const bare = amountOf(t);
    if (bare !== null) {
      q.amount = { kind: 'exact', minor: bare };
      i += 1;
      continue;
    }
    if (STOP.has(t)) {
      i += 1;
      continue;
    }
    // Words about trips that already matched by name ("goa trip") say nothing more.
    if (q.projectIds.length > 0 && (t === 'trip' || t === 'project' || t === 'festival')) {
      i += 1;
      continue;
    }
    const word = normalizeMerchantKey(t);
    if (word) for (const w of word.split(' ')) push(q.words, w);
    i += 1;
  }
  return q;
}

export function isEmptySearch(q: SearchQuery): boolean {
  return (
    !q.period &&
    !q.amount &&
    q.methods.length === 0 &&
    q.categoryIds.length === 0 &&
    q.subcategoryIds.length === 0 &&
    q.tags.length === 0 &&
    q.forWhom.length === 0 &&
    q.projectIds.length === 0 &&
    q.taxSections.length === 0 &&
    q.flags.length === 0 &&
    q.words.length === 0
  );
}

function amountOk(a: AmountPart, v: number): boolean {
  switch (a.kind) {
    case 'over':
      return v > a.minor;
    case 'under':
      return v < a.minor;
    case 'atLeast':
      return v >= a.minor;
    case 'atMost':
      return v <= a.minor;
    case 'exact':
      return v === a.minor;
    default:
      return v >= a.minor && v <= a.to;
  }
}

export function searchMatches(t: Transaction, q: SearchQuery): boolean {
  if (q.period && (t.date < q.period.start || t.date > q.period.end)) return false;
  if (q.amount && !amountOk(q.amount, t.amountMinor)) return false;
  if (q.methods.length > 0 && !q.methods.includes(t.method)) return false;
  if (
    (q.categoryIds.length > 0 || q.subcategoryIds.length > 0) &&
    !q.categoryIds.includes(t.categoryId) &&
    !(t.subcategoryId && q.subcategoryIds.includes(t.subcategoryId))
  )
    return false;
  if (q.tags.length > 0 && !q.tags.some((tag) => t.tags.includes(tag))) return false;
  if (q.forWhom.length > 0 && !q.forWhom.includes((t.forWhom ?? '').trim().toLowerCase()))
    return false;
  if (q.projectIds.length > 0 && !(t.projectId && q.projectIds.includes(t.projectId))) return false;
  if (q.taxSections.length > 0 && !(t.taxSection && q.taxSections.includes(t.taxSection)))
    return false;
  for (const f of q.flags) {
    if (f === 'tax' && !t.taxSection) return false;
    if (f === 'warranty' && !t.warrantyMonths) return false;
    if (f === 'receipt' && !t.hasReceipt) return false;
    if (f === 'split' && !t.split) return false;
    if (f === 'unsure' && !t.unsure) return false;
  }
  if (q.words.length > 0) {
    const hay = normalizeMerchantKey(
      [t.merchant, t.notes, t.raw ?? '', t.tags.join(' '), t.forWhom ?? ''].join(' '),
    );
    if (!q.words.every((w) => hay.includes(w))) return false;
  }
  return true;
}
