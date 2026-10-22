import { CALC_NUMBER, CALC_OPERATOR, evaluateAmount } from './calc';
import { incomeKindFor, type IncomeKind } from './accounts';
import { categorise, type Confidence } from './categoriser';
import {
  addDays, daysInMonth, diffDays, isoFromYMD, MONTHS, parseISO, shiftMonth, weekdayOf,
} from './dates';
import {
  alternation, B_END, B_START, CASH_WORDS, DATE_WORDS, nativeDigits, RUPEE_PREFIXES, RUPEE_WORDS,
} from './indic';
import { parseAmountToMinor } from './money';
import { replaceNumberWords } from './numberWords';
import type { CategoryId, ISODate, PaymentMethod } from './types';

export type TokenKind = 'amount' | 'date' | 'method' | 'income';
export interface Token {
  kind: TokenKind;
  start: number;
  end: number;
}
export type DateSource = 'today' | 'day' | 'monthday' | 'full' | 'relative' | 'weekday';

export interface ParseContext {
  /** Today's local date. Passed in so the parser stays pure and testable. */
  today: ISODate;
  /** Used when no payment method is typed. */
  lastMethod?: PaymentMethod;
  /** Learned rules: normalised merchant key to category id. */
  rules?: Record<string, CategoryId>;
}

export interface ParsedEntry {
  raw: string;
  /** The text the token spans refer to. Differs from raw only when number words were converted. */
  text: string;
  merchant: string;
  amountMinor: number | null;
  date: ISODate;
  dateSource: DateSource;
  /** True when the date is after today (a bare day later this month, for example). */
  upcoming: boolean;
  method: PaymentMethod;
  methodTyped: boolean;
  categoryId: CategoryId;
  confidence: Confidence;
  /** True when no rule or keyword matched and the category is a placeholder. */
  unsure: boolean;
  /** Money in ("salary 40k", "got 500 from Rahul") rather than spending. */
  kind: 'expense' | 'income';
  incomeKind: IncomeKind;
  tokens: Token[];
  errors: string[];
  /** True when the entry can be saved as it stands. */
  ok: boolean;
}

interface Span {
  start: number;
  end: number;
}
interface Resolved {
  date: ISODate | null;
  error?: string;
  upcoming?: boolean;
}
interface DateHit extends Span {
  source: DateSource;
  resolve: (today: ISODate) => Resolved;
}

const MONTH_PATTERN =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const WEEKDAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const monthNumber = (name: string): number => MONTH_INDEX[name.slice(0, 3).toLowerCase()] ?? 0;
const weekdayNumber = (name: string): number => WEEKDAY_INDEX[name.slice(0, 3).toLowerCase()] ?? 0;
const group = (m: RegExpExecArray | RegExpMatchArray, i: number): string => m[i] ?? '';
const spanOf = (m: RegExpExecArray | RegExpMatchArray): Span => ({
  start: m.index ?? 0,
  end: (m.index ?? 0) + m[0].length,
});

/** Day + month (+ optional year). Without a year it picks the most recent sensible occurrence. */
function resolveDayMonth(
  day: number,
  month: number,
  year: number | undefined,
  today: ISODate,
): Resolved {
  if (month < 1 || month > 12) return { date: null, error: 'Month must be between 1 and 12' };
  const t = parseISO(today);
  if (!t) return { date: null, error: 'Today is not a valid date' };
  let y = year ?? t.y;
  if (day < 1 || day > daysInMonth(y, month)) {
    return { date: null, error: `${MONTHS[month - 1]} has ${daysInMonth(y, month)} days` };
  }
  let date = isoFromYMD(y, month, day);
  if (year === undefined && diffDays(date, today) > 7) {
    y -= 1; // a date more than a week ahead was almost certainly last year
    if (day <= daysInMonth(y, month)) date = isoFromYMD(y, month, day);
  }
  return { date, upcoming: diffDays(date, today) > 0 };
}

function resolveDayInMonthOffset(day: number, offset: number, today: ISODate): Resolved {
  const t = parseISO(today);
  if (!t) return { date: null, error: 'Today is not a valid date' };
  const target = shiftMonth(t.y, t.m, offset);
  return resolveDayMonth(day, target.m, target.y, today);
}

function mostRecentWeekday(today: ISODate, target: number, strictlyBefore: boolean): ISODate {
  let delta = (weekdayOf(today) - target + 7) % 7;
  if (strictlyBefore && delta === 0) delta = 7;
  return addDays(today, -delta);
}

/** Hindi and Telugu (and their Roman spellings) for today, yesterday and the day before. */
const INDIC_DATE = new RegExp(`${B_START}(${alternation(Object.keys(DATE_WORDS))})${B_END}`, 'iu');

function detectDate(text: string): DateHit | null {
  let m: RegExpExecArray | null;

  m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (m) {
    const [y, mo, d] = [Number(group(m, 1)), Number(group(m, 2)), Number(group(m, 3))];
    return { ...spanOf(m), source: 'full', resolve: (t) => resolveDayMonth(d, mo, y, t) };
  }

  m = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/.exec(text);
  if (m) {
    const d = Number(group(m, 1));
    const mo = Number(group(m, 2));
    const yy = Number(group(m, 3));
    const y = yy < 100 ? 2000 + yy : yy;
    return { ...spanOf(m), source: 'full', resolve: (t) => resolveDayMonth(d, mo, y, t) };
  }

  m = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_PATTERN}\\b(?:[\\s,]+(\\d{4})\\b)?`,
    'i',
  ).exec(text);
  if (m) {
    const d = Number(group(m, 1));
    const mo = monthNumber(group(m, 2));
    const y = group(m, 3) ? Number(group(m, 3)) : undefined;
    return { ...spanOf(m), source: 'monthday', resolve: (t) => resolveDayMonth(d, mo, y, t) };
  }

  m = new RegExp(`\\b${MONTH_PATTERN}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:[\\s,]+(\\d{4})\\b)?`, 'i').exec(
    text,
  );
  if (m) {
    const mo = monthNumber(group(m, 1));
    const d = Number(group(m, 2));
    const y = group(m, 3) ? Number(group(m, 3)) : undefined;
    return { ...spanOf(m), source: 'monthday', resolve: (t) => resolveDayMonth(d, mo, y, t) };
  }

  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(last|previous|prev|this)\s+month\b/i.exec(text);
  if (m) {
    const d = Number(group(m, 1));
    const offset = group(m, 2).toLowerCase() === 'this' ? 0 : -1;
    return { ...spanOf(m), source: 'day', resolve: (t) => resolveDayInMonthOffset(d, offset, t) };
  }
  m = /\b(last|previous|prev|this)\s+month\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text);
  if (m) {
    const d = Number(group(m, 2));
    const offset = group(m, 1).toLowerCase() === 'this' ? 0 : -1;
    return { ...spanOf(m), source: 'day', resolve: (t) => resolveDayInMonthOffset(d, offset, t) };
  }

  m = INDIC_DATE.exec(text);
  if (m) {
    const back = DATE_WORDS[group(m, 1).toLowerCase().replace(/\s+/g, ' ')] ?? 0;
    return { ...spanOf(m), source: 'relative', resolve: (t) => ({ date: addDays(t, -back) }) };
  }

  m = new RegExp(
    '\\b(day before yesterday|yesterday|today' +
      '|(\\d{1,3})\\s+days?\\s+ago' +
      '|(?:last|previous)\\s+(sunday|sun|monday|mon(?!th)|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)' +
      '|(?:on\\s+|this\\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday))\\b',
    'i',
  ).exec(text);
  if (m) {
    const phrase = group(m, 1).toLowerCase();
    const span = spanOf(m);
    if (phrase === 'day before yesterday') {
      return { ...span, source: 'relative', resolve: (t) => ({ date: addDays(t, -2) }) };
    }
    if (phrase === 'yesterday') {
      return { ...span, source: 'relative', resolve: (t) => ({ date: addDays(t, -1) }) };
    }
    if (phrase === 'today') {
      return { ...span, source: 'relative', resolve: (t) => ({ date: t }) };
    }
    if (group(m, 2)) {
      const n = Number(group(m, 2));
      return { ...span, source: 'relative', resolve: (t) => ({ date: addDays(t, -n) }) };
    }
    if (group(m, 3)) {
      const target = weekdayNumber(group(m, 3));
      return {
        ...span,
        source: 'weekday',
        resolve: (t) => ({ date: mostRecentWeekday(t, target, true) }),
      };
    }
    const target = weekdayNumber(group(m, 4));
    return {
      ...span,
      source: 'weekday',
      resolve: (t) => ({ date: mostRecentWeekday(t, target, false) }),
    };
  }

  for (const hit of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})\b(?![/-]\d)/g)) {
    const d = Number(group(hit, 1));
    const mo = Number(group(hit, 2));
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return { ...spanOf(hit), source: 'monthday', resolve: (t) => resolveDayMonth(d, mo, undefined, t) };
    }
  }

  for (const hit of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi)) {
    const d = Number(group(hit, 1));
    if (d >= 1 && d <= 31) {
      return { ...spanOf(hit), source: 'day', resolve: (t) => resolveDayInMonthOffset(d, 0, t) };
    }
  }

  for (const hit of text.matchAll(/\b(?:on|dated)\s+(\d{1,2})\b(?![\d/\-.:])/gi)) {
    const d = Number(group(hit, 1));
    if (d >= 1 && d <= 31) {
      return { ...spanOf(hit), source: 'day', resolve: (t) => resolveDayInMonthOffset(d, 0, t) };
    }
  }
  return null;
}

const METHOD_PATTERNS: Array<[RegExp, PaymentMethod]> = [
  [/\b(?:upi|gpay|google\s*pay|phone\s*pe|phonepe|paytm|bhim)\b/i, 'UPI'],
  [/\bcash\b/i, 'Cash'],
  [new RegExp(`${B_START}(?:${alternation(CASH_WORDS)})${B_END}`, 'iu'), 'Cash'],
  [/\b(?:credit\s*card|debit\s*card|card|credit|debit)\b/i, 'Card'],
  [/\b(?:net\s*banking|netbanking|neft|imps|rtgs|bank\s*transfer|bank|transfer)\b/i, 'Bank transfer'],
];

function detectMethod(text: string, taken: Span[]): { method: PaymentMethod; span: Span } | null {
  for (const [pattern, method] of METHOD_PATTERNS) {
    const m = pattern.exec(text);
    if (m && !overlaps(spanOf(m), taken)) return { method, span: spanOf(m) };
  }
  return null;
}

function overlaps(a: Span, spans: readonly Span[]): boolean {
  return spans.some((s) => a.start < s.end && s.start < a.end);
}

interface NumberWord extends Span {
  /** Index of the first and last whitespace-separated word it covers. */
  index: number;
  last: number;
  digits: string;
  isInteger: boolean;
  marked: boolean;
  kilo: boolean;
  /** Set for a sum such as "250+120/2": its worked-out value in minor units. */
  value?: number;
}

const PREFIXES = `₹|rs\\.?|inr|(?:${alternation(RUPEE_PREFIXES)})\\.?`;
const NUMBER_WORD = new RegExp(
  `^(?:${PREFIXES})?(\\d[\\d,]*(?:\\.\\d+)?)(k)?(\\/-|rs\\.?|inr)?$`,
  'iu',
);
const MARKED_START = new RegExp(`^(?:${PREFIXES})`, 'iu');
const MARKER_WORD = new RegExp(`^(?:₹|rs\\.?|inr|rupees?|${alternation(RUPEE_WORDS)})$`, 'iu');
const PREFIX_MARKER = new RegExp(`^(?:₹|rs\\.?|inr|${alternation(RUPEE_PREFIXES)})$`, 'iu');
/** A sum typed as the amount, optionally after a rupee sign: "250+120/2", "₹3 x 45", "2k+500". */
const SUM = new RegExp(
  `(?<![\\p{L}\\p{M}\\p{N}.,])(?:(₹|rs\\.?|inr)\\s?)?(${CALC_NUMBER}(?:\\s*${CALC_OPERATOR}\\s*${CALC_NUMBER})+)(?![\\p{L}\\p{M}\\p{N}])`,
  'giu',
);

function findNumbers(
  text: string,
  taken: Span[],
): { numbers: NumberWord[]; markers: Span[]; errors: string[] } {
  const words = [...text.matchAll(/\S+/g)].map((m, index) => ({
    index,
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    token: m[0].replace(/[.,;:!?]+$/, ''),
  }));
  const numbers: NumberWord[] = [];
  const markers: Span[] = [];
  const errors: string[] = [];
  const sums: Span[] = [];
  for (const m of text.matchAll(SUM)) {
    const span = spanOf(m);
    if (overlaps(span, taken)) continue;
    const covered = words.filter((w) => w.start < span.end && span.start < w.end);
    const result = evaluateAmount(group(m, 2));
    sums.push(span);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    numbers.push({
      ...span,
      index: covered[0]?.index ?? 0,
      last: covered[covered.length - 1]?.index ?? 0,
      digits: '',
      isInteger: false,
      marked: group(m, 1) !== '',
      kilo: false,
      value: result.minor,
    });
  }
  for (const w of words) {
    if (overlaps(w, taken) || overlaps(w, sums)) continue;
    const m = NUMBER_WORD.exec(w.token);
    if (m) {
      const digits = group(m, 1);
      const marked = MARKED_START.test(w.token) || group(m, 3) !== '';
      numbers.push({
        start: w.start,
        end: w.end,
        index: w.index,
        last: w.index,
        digits,
        isInteger: /^\d+$/.test(digits) && !/k$/i.test(w.token),
        marked,
        kilo: group(m, 2) !== '',
      });
    }
  }
  for (const w of words) {
    if (overlaps(w, taken) || overlaps(w, sums) || !MARKER_WORD.test(w.token)) continue;
    const next = numbers.find((n) => n.index === w.index + 1);
    const prev = numbers.find((n) => n.last === w.index - 1);
    if (PREFIX_MARKER.test(w.token) && next) next.marked = true;
    else if (prev) prev.marked = true;
    else if (next) next.marked = true;
    markers.push({ start: w.start, end: w.end });
  }
  return { numbers, markers, errors };
}

function numberToMinor(n: NumberWord): number | null {
  if (n.value !== undefined) return n.value;
  const minor = parseAmountToMinor(n.digits);
  if (minor === null) return null;
  return n.kilo ? minor * 1000 : minor;
}

const INCOME_VERB = /\b(?:received|recieved|got|credited|earned)\b/i;
const INCOME_NOUN =
  /\b(?:salary|bonus|stipend|wages|payslip|paycheck|income|dividends?|refunds?|refunded|cashback)\b/i;

const FILLER = /\b(?:on|for|at|to|paid|spent|via|using|by|with|rupees?|rs|inr)\b/gi;

function titleCase(s: string): string {
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) =>
      /[A-Z]/.test(w.slice(1)) || (w.length <= 3 && w === w.toUpperCase() && /[A-Z]/.test(w))
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(' ');
}

function buildMerchant(text: string, taken: Span[]): string {
  const sorted = [...taken].sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const span of sorted) {
    out += `${text.slice(pos, span.start)} `;
    pos = Math.max(pos, span.end);
  }
  out += text.slice(pos);
  out = out
    .replace(FILLER, ' ')
    .replace(/[₹/,;:!?()]+/g, ' ')
    .replace(/(^|\s)[-.]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return titleCase(out);
}

export function parseQuickEntry(input: string, ctx: ParseContext): ParsedEntry {
  const text = replaceNumberWords(nativeDigits(input));
  const taken: Span[] = [];
  const tokens: Token[] = [];
  const errors: string[] = [];
  const claim = (kind: TokenKind, span: Span) => {
    taken.push(span);
    tokens.push({ kind, start: span.start, end: span.end });
  };

  let date: ISODate = ctx.today;
  let dateSource: DateSource = 'today';
  let upcoming = false;
  let haveDate = false;

  const applyDate = (hit: DateHit) => {
    haveDate = true;
    dateSource = hit.source;
    const r = hit.resolve(ctx.today);
    if (r.date) {
      date = r.date;
      upcoming = Boolean(r.upcoming);
    } else errors.push(r.error ?? 'That date is not valid');
  };

  const dateHit = detectDate(text);
  if (dateHit) {
    claim('date', dateHit);
    applyDate(dateHit);
  }

  const methodHit = detectMethod(text, taken);
  if (methodHit) claim('method', methodHit.span);

  // Money in: a verb that only says so is taken out of the name; a noun (salary, refund) stays in it.
  const incomeVerb = INCOME_VERB.exec(text);
  if (incomeVerb && !overlaps(spanOf(incomeVerb), taken)) claim('income', spanOf(incomeVerb));
  const isIncome = Boolean(incomeVerb) || INCOME_NOUN.test(text);

  const scan = findNumbers(text, taken);
  const { numbers, markers } = scan;
  errors.push(...scan.errors);
  let amountMinor: number | null = null;
  let chosen: NumberWord | undefined;
  const marked = numbers.filter((n) => n.marked);
  const sums = numbers.filter((n) => n.value !== undefined);
  if (marked.length > 0) chosen = marked[0];
  else if (sums.length > 0) chosen = sums[0];
  else {
    chosen = numbers.reduce<NumberWord | undefined>((best, n) => {
      const value = numberToMinor(n) ?? -1;
      return !best || value > (numberToMinor(best) ?? -1) ? n : best;
    }, undefined);
  }
  if (chosen) {
    amountMinor = numberToMinor(chosen);
    claim('amount', chosen);
    for (const marker of markers) claim('amount', marker);
  }

  if (!haveDate) {
    const leftovers = numbers.filter(
      (n) => n !== chosen && n.isInteger && !n.marked && Number(n.digits) >= 1 && Number(n.digits) <= 31,
    );
    const only = leftovers.length === 1 ? leftovers[0] : undefined;
    if (only) {
      const day = Number(only.digits);
      const hit: DateHit = {
        start: only.start,
        end: only.end,
        source: 'day',
        resolve: (t) => resolveDayInMonthOffset(day, 0, t),
      };
      claim('date', hit);
      applyDate(hit);
    }
  }

  const merchantText = buildMerchant(text, taken);
  const merchant = merchantText || 'Expense';
  const found = categorise(merchantText, ctx.rules);

  return {
    raw: input,
    text,
    merchant,
    amountMinor,
    date,
    dateSource,
    upcoming,
    method: methodHit?.method ?? ctx.lastMethod ?? 'Other',
    methodTyped: Boolean(methodHit),
    categoryId: found.categoryId,
    confidence: found.confidence,
    unsure: found.confidence === 'none',
    kind: isIncome ? 'income' : 'expense',
    incomeKind: incomeKindFor(text),
    tokens: tokens.sort((a, b) => a.start - b.start),
    errors,
    ok: errors.length === 0 && amountMinor !== null && amountMinor > 0,
  };
}
