import {
  fromBase64Url,
  SUPPORTED_ALGS,
  toBase64Url,
  type LockPasskey,
  type PasskeyAssertion,
} from '../domain/passkey';

/**
 * The browser side of unlocking with Face ID or fingerprint (Drop 13). The passkey is made on this
 * device for this site; Ledger keeps its id and public key and checks each unlock itself.
 */

export async function passkeyAvailable(): Promise<boolean> {
  try {
    return (
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      typeof PublicKeyCredential !== 'undefined' &&
      typeof navigator.credentials?.create === 'function' &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));

/** Asks the device to make a passkey. Null when it could not (cancelled, or not supported). */
export async function createPasskey(): Promise<LockPasskey | null> {
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: 'Ledger' },
        user: { id: random(16), name: 'Ledger screen lock', displayName: 'Ledger screen lock' },
        pubKeyCredParams: SUPPORTED_ALGS.map((alg) => ({ type: 'public-key' as const, alg })),
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
        },
        attestation: 'none',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!credential) return null;
    const response = credential.response as AuthenticatorAttestationResponse;
    const key = response.getPublicKey?.();
    const alg = response.getPublicKeyAlgorithm?.();
    if (!key || alg === undefined || !(SUPPORTED_ALGS as readonly number[]).includes(alg))
      return null;
    return {
      id: toBase64Url(credential.rawId),
      publicKey: toBase64Url(key),
      alg,
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/** Asks the device to sign an unlock with the saved passkey. Null when cancelled or it failed. */
export async function signUnlock(passkey: LockPasskey): Promise<PasskeyAssertion | null> {
  const challenge = random(32);
  try {
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(passkey.id) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!credential) return null;
    const response = credential.response as AuthenticatorAssertionResponse;
    return {
      challenge,
      origin: window.location.origin,
      rpId: window.location.hostname,
      authenticatorData: response.authenticatorData,
      clientDataJSON: response.clientDataJSON,
      signature: response.signature,
    };
  } catch {
    return null;
  }
}
