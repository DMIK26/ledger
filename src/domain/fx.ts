/**
 * Entries paid in another currency: the amount is stored in rupees (so every total works as before) with
 * the original amount and the rate the user typed kept beside it. Rates are integers with four decimals
 * (83.25 is 832500), so no floating point touches money.
 */

export const FX_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'] as const;

export interface ForeignAmount {
  currency: string;
  amountMinor: number;
  /** Rupees per unit, times 10,000. */
  rate4: number;
}

/** "83.25" to 832500. Null for anything that is not a positive number with up to four decimals. */
export function parseRate(text: string): number | null {
  const s = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return null;
  const [whole = '0', fraction = ''] = s.split('.');
  const rate4 = parseInt(whole, 10) * 10_000 + parseInt((fraction + '0000').slice(0, 4), 10);
  return rate4 > 0 && Number.isSafeInteger(rate4) ? rate4 : null;
}

/** The rupee amount for a foreign amount, rounded to the paisa. */
export function convertMinor(foreignMinor: number, rate4: number): number {
  return Math.round((foreignMinor * rate4) / 10_000);
}

/** The rate as a rupee amount in minor units (83.25 is 8325), for showing through fmtMoney. */
export const rateAsMinor = (rate4: number): number => Math.round(rate4 / 100);

/** Plain text for an editable rate field ("83.25"). */
export function rateInput(rate4: number): string {
  const whole = Math.floor(rate4 / 10_000);
  const frac = String(rate4 % 10_000)
    .padStart(4, '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}
