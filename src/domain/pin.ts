import type { LockConfig } from './types';
import { tl } from './i18n';

export const PIN_ITERATIONS = 210_000;

export const isValidPin = (pin: string): boolean => /^\d{4,8}$/.test(pin);

const toHex = (bytes: ArrayBuffer | Uint8Array): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

async function derive(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return toHex(bits);
}

/** Salted PBKDF2-SHA-256. The PIN itself is never stored. */
export async function hashPin(
  pin: string,
  iterations: number = PIN_ITERATIONS,
): Promise<LockConfig> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  return { salt: toHex(salt), hash: await derive(pin, salt, iterations), iterations };
}

export async function verifyPin(pin: string, lock: LockConfig): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const hash = await derive(pin, fromHex(lock.salt), lock.iterations);
  // Constant-time comparison: both strings are 64 hex characters.
  let diff = hash.length ^ lock.hash.length;
  for (let i = 0; i < hash.length; i += 1) diff |= hash.charCodeAt(i) ^ lock.hash.charCodeAt(i);
  return diff === 0;
}

/** "Forgot PIN?" removes the PIN after this wait; the data is never touched. */
export const RESET_WAIT_MS = 24 * 60 * 60 * 1000;

/** Milliseconds left before a reset requested at `requestedAt` takes effect (0 when due). */
export function resetRemaining(requestedAt: number, now: number): number {
  return Math.max(0, Math.min(RESET_WAIT_MS, requestedAt + RESET_WAIT_MS - now));
}

export const resetDue = (requestedAt: number, now: number): boolean =>
  resetRemaining(requestedAt, now) === 0;

/** Plain wording for the time left: "about 23 hours", "about 40 minutes", "less than a minute". */
export function fmtWait(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return ms <= 0 ? tl('no time') : tl('less than a minute');
  if (minutes < 60) return tl('about {0} minutes', minutes);
  const hours = Math.round(minutes / 60);
  return hours === 1 ? tl('about 1 hour') : tl('about {0} hours', hours);
}
