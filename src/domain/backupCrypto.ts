import { tl } from './i18n';
/**
 * Password-protected backups (Drop 13). The file is encrypted on the device with AES-GCM; the key comes
 * from the password through PBKDF2-SHA-256 with a random salt. The password is never stored, so without
 * it the file cannot be opened by anyone, Ledger included.
 */

export const BACKUP_KDF_ROUNDS = 600_000;
export const MIN_PASSWORD = 8;

export interface ProtectedBackup {
  app: 'ledger';
  protected: {
    v: 1;
    kdf: 'PBKDF2-SHA-256';
    rounds: number;
    /** Base64. */
    salt: string;
    iv: string;
    data: string;
  };
}

const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK)
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => {
  const s = atob(text);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
};

async function keyFor(password: string, salt: Uint8Array<ArrayBuffer>, rounds: number) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function passwordProblem(password: string, again: string): string | null {
  if (password.length < MIN_PASSWORD) return tl('Use at least {0} characters', MIN_PASSWORD);
  if (password !== again) return tl('The two passwords are not the same');
  return null;
}

export async function protectBackup(
  json: string,
  password: string,
  rounds: number = BACKUP_KDF_ROUNDS,
): Promise<ProtectedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await keyFor(password, salt, rounds);
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json)),
  );
  return {
    app: 'ledger',
    protected: {
      v: 1,
      kdf: 'PBKDF2-SHA-256',
      rounds,
      salt: toBase64(salt),
      iv: toBase64(iv),
      data: toBase64(data),
    },
  };
}

export function isProtectedBackup(v: unknown): v is ProtectedBackup {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const p = o.protected as Record<string, unknown> | undefined;
  return (
    o.app === 'ledger' &&
    typeof p === 'object' &&
    p !== null &&
    p.v === 1 &&
    typeof p.salt === 'string' &&
    typeof p.iv === 'string' &&
    typeof p.data === 'string' &&
    Number.isInteger(p.rounds)
  );
}

/** The backup's JSON text, or null when the password is wrong (or the file was changed). */
export async function openBackup(file: ProtectedBackup, password: string): Promise<string | null> {
  try {
    const p = file.protected;
    const key = await keyFor(password, fromBase64(p.salt), p.rounds);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(p.iv) },
      key,
      fromBase64(p.data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
