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
      notation: compact ? 'compact' : 'standard',
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
  return formatter(currency, compact, signed).format(minor / 100);
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
