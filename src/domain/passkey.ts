/**
 * Unlock with Face ID or fingerprint (Drop 13): a passkey made on this device. Ledger keeps only the
 * passkey's id and public key, and checks the device's signature itself, so nothing leaves the device.
 */

export interface LockPasskey {
  /** The credential id, base64url. */
  id: string;
  /** The public key as SubjectPublicKeyInfo, base64url. */
  publicKey: string;
  /** COSE algorithm: -7 is ES256 (P-256), -257 is RS256. */
  alg: number;
  createdAt: number;
}

export interface PasskeyAssertion {
  challenge: Uint8Array;
  /** Where Ledger runs, e.g. https://dmik26.github.io, and its host name. */
  origin: string;
  rpId: string;
  authenticatorData: ArrayBuffer | Uint8Array;
  clientDataJSON: ArrayBuffer | Uint8Array;
  signature: ArrayBuffer | Uint8Array;
}

export const SUPPORTED_ALGS = [-7, -257] as const;

const bytes = (b: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> => {
  const src = b instanceof Uint8Array ? b : new Uint8Array(b);
  const out = new Uint8Array(new ArrayBuffer(src.length));
  out.set(src);
  return out;
};

export function toBase64Url(b: ArrayBuffer | Uint8Array): string {
  let s = '';
  for (const x of bytes(b)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

/** WebAuthn ECDSA signatures are DER; WebCrypto wants r and s side by side. Null when malformed. */
export function derToRaw(der: Uint8Array, size = 32): Uint8Array<ArrayBuffer> | null {
  let i = 0;
  if (der[i++] !== 0x30) return null;
  let len = der[i++]!;
  if (len & 0x80) i += len & 0x7f;
  const out = new Uint8Array(new ArrayBuffer(size * 2));
  for (const part of [0, 1]) {
    if (der[i++] !== 0x02) return null;
    len = der[i++]!;
    let int = der.subarray(i, i + len);
    i += len;
    while (int.length > size && int[0] === 0) int = int.subarray(1);
    if (int.length > size || int.length === 0) return null;
    out.set(int, part * size + (size - int.length));
  }
  return out;
}

const sha256 = async (data: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data));

const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Whether the device really signed this unlock: right passkey, challenge, site, and a person present. */
export async function verifyAssertion(key: LockPasskey, a: PasskeyAssertion): Promise<boolean> {
  try {
    const clientBytes = bytes(a.clientDataJSON);
    const client = JSON.parse(new TextDecoder().decode(clientBytes)) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
    if (client.type !== 'webauthn.get') return false;
    if (client.challenge !== toBase64Url(a.challenge)) return false;
    if (client.origin !== a.origin) return false;
    const auth = bytes(a.authenticatorData);
    if (auth.length < 37) return false;
    if (!same(auth.subarray(0, 32), await sha256(new TextEncoder().encode(a.rpId)))) return false;
    const flags = auth[32]!;
    // User present and user verified (Face ID, fingerprint or the device passcode).
    if ((flags & 0x01) === 0 || (flags & 0x04) === 0) return false;
    const signed = new Uint8Array(new ArrayBuffer(auth.length + 32));
    signed.set(auth);
    signed.set(await sha256(clientBytes), auth.length);
    const spki = fromBase64Url(key.publicKey);
    if (key.alg === -7) {
      const pub = await crypto.subtle.importKey(
        'spki',
        spki,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      const raw = derToRaw(bytes(a.signature));
      if (!raw) return false;
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, raw, signed);
    }
    if (key.alg === -257) {
      const pub = await crypto.subtle.importKey(
        'spki',
        spki,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pub, bytes(a.signature), signed);
    }
    return false;
  } catch {
    return false;
  }
}
