/**
 * The only module allowed to turn an amount into text (enforced by ESLint).
 * Privacy mode is applied here, so real digits never reach the DOM while it is on.
 */

export interface CurrencyInfo {
  symbol: string;
  locale: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'en-IE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  AED: { symbol: 'AED', locale: 'en-AE' },
  SGD: { symbol: 'S$', locale: 'en-SG' },
  AUD: { symbol: 'A$', locale: 'en-AU' },
  CAD: { symbol: 'CA$', locale: 'en-CA' },
};

const FALLBACK: CurrencyInfo = { symbol: '₹', locale: 'en-IN' };

let privacyOn = false;
const listeners = new Set<() => void>();

export const isPrivacyOn = (): boolean => privacyOn;

export function setPrivacy(on: boolean): void {
  if (privacyOn === on) return;
  privacyOn = on;
  listeners.forEach((l) => l());
}

export function subscribePrivacy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface MoneyOptions {
  currency?: string;
  /** Short form such as ₹37.6K. */
  compact?: boolean;
  /** Always show + or - (zero stays unsigned). */
  signed?: boolean;
  /** Bypass privacy mode. Only for exports the user has confirmed. */
  reveal?: boolean;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, compact: boolean, signed: boolean): Intl.NumberFormat {
  const key = `${currency}|${compact}|${signed}`;
  let f = formatters.get(key);
  if (!f) {
    const known = currency in CURRENCIES;
    const info = CURRENCIES[currency] ?? FALLBACK;
    f = new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency: known ? currency : 'INR',
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 1 : 2,
      signDisplay: signed ? 'exceptZero' : 'auto',
    });
    formatters.set(key, f);
  }
  return f;
}

/** Fixed-shape stand-in shown while privacy mode is on. Reveals nothing, not even magnitude. */
export function maskedMoney(currency = 'INR', compact = false): string {
  const symbol = (CURRENCIES[currency] ?? FALLBACK).symbol;
  return compact ? `${symbol}88k` : `${symbol}88,888.88`;
}

export function fmtMoney(minor: number, opts: MoneyOptions = {}): string {
  const { currency = 'INR', compact = false, signed = false, reveal = false } = opts;
  if (privacyOn && !reveal) return maskedMoney(currency, compact);
  if (!compact) return formatter(currency, false, signed).format(minor / 100);
  // Compact labels are built here rather than with Intl's compact notation, whose Indian-English
  // output differs between engines ("₹10K" in one, "₹10T" in another). Rupees use k, L and Cr.
  const value = minor / 100;
  const units: Array<[number, string]> =
    currency === 'INR'
      ? [
          [1e7, 'Cr'],
          [1e5, 'L'],
          [1e3, 'k'],
        ]
      : [
          [1e9, 'B'],
          [1e6, 'M'],
          [1e3, 'k'],
        ];
  const unit = units.find(([n]) => Math.abs(value) >= n);
  const scaled = unit ? value / unit[0] : value;
  return formatter(currency, true, signed).format(scaled) + (unit ? unit[1] : '');
}

/**
 * Parses "1,200.50" style text into integer minor units without floating point.
 * Returns null when the text is not a plain decimal number.
 */
export function parseAmountToMinor(text: string): number | null {
  const s = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole = '0', fraction = ''] = s.split('.');
  let minor = parseInt(whole, 10) * 100 + parseInt((fraction + '00').slice(0, 2), 10);
  if (fraction.length > 2 && fraction.charCodeAt(2) >= 53) minor += 1; // round half up
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Plain editable text for an amount field ("500", "1200.5" becomes "1200.50"). No grouping, no symbol.
 * Callers must not render this while privacy mode is on.
 */
export function minorToInput(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return cents === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(cents).padStart(2, '0')}`;
}

/** Plain decimal text with two places ("500.00", "-12.30") for CSV files. No symbol, no grouping. */
export function minorToPlain(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
