import type { LockConfig } from './types';

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
