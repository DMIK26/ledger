import { categorise, type Confidence } from './categoriser';
import {
  addDays, daysInMonth, diffDays, isoFromYMD, MONTHS, parseISO, shiftMonth, weekdayOf,
} from './dates';
import { parseAmountToMinor } from './money';
import { replaceNumberWords } from './numberWords';
import type { CategoryId, ISODate, PaymentMethod } from './types';

export type TokenKind = 'amount' | 'date' | 'method';
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
  index: number;
  digits: string;
  isInteger: boolean;
  marked: boolean;
  kilo: boolean;
}

const NUMBER_WORD = /^(?:₹|rs\.?|inr)?(\d[\d,]*(?:\.\d+)?)(k)?(\/-|rs\.?|inr)?$/i;
const MARKER_WORD = /^(?:₹|rs\.?|inr|rupees?)$/i;
const PREFIX_MARKER = /^(?:₹|rs\.?|inr)$/i;

function findNumbers(text: string, taken: Span[]): { numbers: NumberWord[]; markers: Span[] } {
  const words = [...text.matchAll(/\S+/g)].map((m, index) => ({
    index,
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    token: m[0].replace(/[.,;:!?]+$/, ''),
  }));
  const numbers: NumberWord[] = [];
  const markers: Span[] = [];
  for (const w of words) {
    if (overlaps(w, taken)) continue;
    const m = NUMBER_WORD.exec(w.token);
    if (m) {
      const digits = group(m, 1);
      const marked =
        /^(?:₹|rs|inr)/i.test(w.token) || group(m, 3) !== '' || w.token.startsWith('₹');
      numbers.push({
        start: w.start,
        end: w.end,
        index: w.index,
        digits,
        isInteger: /^\d+$/.test(digits) && !/k$/i.test(w.token),
        marked,
        kilo: group(m, 2) !== '',
      });
    }
  }
  for (const w of words) {
    if (overlaps(w, taken) || !MARKER_WORD.test(w.token)) continue;
    const next = numbers.find((n) => n.index === w.index + 1);
    const prev = numbers.find((n) => n.index === w.index - 1);
    if (PREFIX_MARKER.test(w.token) && next) next.marked = true;
    else if (prev) prev.marked = true;
    else if (next) next.marked = true;
    markers.push({ start: w.start, end: w.end });
  }
  return { numbers, markers };
}

function numberToMinor(n: NumberWord): number | null {
  const minor = parseAmountToMinor(n.digits);
  if (minor === null) return null;
  return n.kilo ? minor * 1000 : minor;
}

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
  const text = replaceNumberWords(input);
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

  const { numbers, markers } = findNumbers(text, taken);
  let amountMinor: number | null = null;
  let chosen: NumberWord | undefined;
  const marked = numbers.filter((n) => n.marked);
  if (marked.length > 0) chosen = marked[0];
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
    tokens: tokens.sort((a, b) => a.start - b.start),
    errors,
    ok: errors.length === 0 && amountMinor !== null && amountMinor > 0,
  };
}
