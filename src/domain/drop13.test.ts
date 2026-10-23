import { describe, expect, it } from 'vitest';
import type { Account } from './accounts';
import { billsDue } from './badge';
import { isProtectedBackup, openBackup, passwordProblem, protectBackup } from './backupCrypto';
import { derToRaw, toBase64Url, verifyAssertion, type LockPasskey } from './passkey';
import type { RecurringItem } from './recurring';
import { hasShopRows, inSpace, profitAndLoss, spaceOf } from './spaces';

describe('spaces', () => {
  it('treat rows without a space as Personal', () => {
    expect(spaceOf({})).toBe('personal');
    expect(spaceOf({ space: 'shop' })).toBe('shop');
    expect(inSpace({}, 'personal')).toBe(true);
    expect(inSpace({}, 'shop')).toBe(false);
    expect(inSpace({ space: 'shop' }, 'both')).toBe(true);
  });

  it('work out profit and loss, with a row per month for longer periods', () => {
    const pl = profitAndLoss({
      transactions: [
        { date: '2026-09-10', amountMinor: 200_000, categoryId: 'business' },
        { date: '2026-10-05', amountMinor: 300_000, categoryId: 'business' },
        { date: '2026-10-06', amountMinor: 50_000, categoryId: 'transport' },
        { date: '2026-11-01', amountMinor: 999, categoryId: 'business' },
      ],
      flows: [
        { kind: 'income', date: '2026-09-15', amountMinor: 500_000 },
        { kind: 'income', date: '2026-10-15', amountMinor: 800_000 },
        { kind: 'fee', date: '2026-10-20', amountMinor: 10_000 },
        { kind: 'transfer', date: '2026-10-21', amountMinor: 70_000 },
      ],
      start: '2026-09-01',
      end: '2026-10-31',
    });
    expect(pl).toMatchObject({
      salesMinor: 1_300_000,
      spentMinor: 550_000,
      feesMinor: 10_000,
      profitMinor: 740_000,
      marginPct: 57,
    });
    expect(pl.byCategory).toEqual([
      { categoryId: 'business', totalMinor: 500_000 },
      { categoryId: 'transport', totalMinor: 50_000 },
    ]);
    expect(pl.months).toEqual([
      {
        month: '2026-09',
        salesMinor: 500_000,
        spentMinor: 200_000,
        feesMinor: 0,
        profitMinor: 300_000,
      },
      {
        month: '2026-10',
        salesMinor: 800_000,
        spentMinor: 350_000,
        feesMinor: 10_000,
        profitMinor: 440_000,
      },
    ]);
    const month = profitAndLoss({
      transactions: [],
      flows: [],
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(month.months).toEqual([]);
    expect(month.marginPct).toBeNull();
  });
});

describe('password-protected backups', () => {
  it('open with the right password only, and never contain the plain text', async () => {
    const json = JSON.stringify({
      app: 'ledger',
      data: { transactions: [{ merchant: 'Swiggy' }] },
    });
    const file = await protectBackup(json, 'correct horse', 1000);
    expect(isProtectedBackup(file)).toBe(true);
    expect(isProtectedBackup(JSON.parse(json))).toBe(false);
    expect(JSON.stringify(file)).not.toContain('Swiggy');
    expect(file.protected.rounds).toBe(1000);
    expect(await openBackup(file, 'correct horse')).toBe(json);
    expect(await openBackup(file, 'wrong horse')).toBeNull();
    // A changed file does not open either (AES-GCM checks it).
    const tampered = {
      ...file,
      protected: { ...file.protected, data: `A${file.protected.data.slice(1)}` },
    };
    expect(await openBackup(tampered, 'correct horse')).toBeNull();
    // Two backups of the same data differ (fresh salt and IV each time).
    const again = await protectBackup(json, 'correct horse', 1000);
    expect(again.protected.data).not.toBe(file.protected.data);
  });

  it('ask for a long enough password, typed twice', () => {
    expect(passwordProblem('short', 'short')).toMatch(/at least 8/);
    expect(passwordProblem('long enough', 'long enougH')).toMatch(/not the same/);
    expect(passwordProblem('long enough', 'long enough')).toBeNull();
  });
});

describe('the app badge', () => {
  it('counts recurring payments and card payments due in the next seven days', () => {
    const bill = (id: string, anchor: string, space?: 'shop'): RecurringItem => ({
      id,
      merchant: id,
      categoryId: 'bills',
      method: 'UPI',
      amountMinor: 10_000,
      cadence: 'monthly',
      anchor,
      createdAt: 0,
      ...(space ? { space } : {}),
    });
    const card: Account = {
      id: 'sbi',
      name: 'SBI card',
      kind: 'card',
      openingMinor: 0,
      openingDate: '2026-01-01',
      methods: ['Card'],
      order: 0,
      statementDay: 15,
      dueDay: 25,
      createdAt: 0,
      updatedAt: 0,
    };
    const data = {
      transactions: [{ date: '2026-10-10', amountMinor: 300_000, method: 'Card' as const }],
      flows: [],
      udhaar: [],
    };
    const recurring = [
      bill('Rent', '2026-09-24'),
      bill('Shop rent', '2026-09-29', 'shop'),
      bill('Netflix', '2026-09-30'),
      bill('Gym', '2026-09-10'),
    ];
    expect(billsDue(recurring, [card], data, '2026-10-22')).toBe(3);
    expect(billsDue([], [], { transactions: [], flows: [], udhaar: [] }, '2026-10-22')).toBe(0);
  });

  it('a backup with any Shop row is spotted', () => {
    expect(hasShopRows({ transactions: [{ id: 'a' }], flows: [] })).toBe(false);
    expect(hasShopRows({ transactions: [], loans: [{ id: 'b', space: 'shop' }] })).toBe(true);
  });
});

/** The other way round, for building test signatures as authenticators send them. */
const rawToDer = (raw: Uint8Array): Uint8Array => {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i += 1;
    const v = b.subarray(i);
    return v[0]! & 0x80 ? [0x02, v.length + 1, 0, ...v] : [0x02, v.length, ...v];
  };
  const body = [...int(raw.subarray(0, 32)), ...int(raw.subarray(32))];
  return new Uint8Array([0x30, body.length, ...body]);
};

describe('passkey unlock', () => {
  const origin = 'https://dmik26.github.io';
  const rpId = 'dmik26.github.io';
  const sha = async (b: Uint8Array) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>));

  const ceremony = async (
    sign: (data: Uint8Array<ArrayBuffer>) => Promise<Uint8Array>,
    over: { flags?: number; type?: string; origin?: string; challenge?: Uint8Array } = {},
  ) => {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const authenticatorData = new Uint8Array([
      ...(await sha(new TextEncoder().encode(rpId))),
      over.flags ?? 0x05,
      0,
      0,
      0,
      1,
    ]);
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({
        type: over.type ?? 'webauthn.get',
        challenge: toBase64Url(over.challenge ?? challenge),
        origin: over.origin ?? origin,
      }),
    );
    const signed = new Uint8Array([...authenticatorData, ...(await sha(clientDataJSON))]);
    return {
      challenge,
      origin,
      rpId,
      authenticatorData,
      clientDataJSON,
      signature: await sign(signed),
    };
  };

  it('accepts the device’s ES256 signature and nothing else', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const key: LockPasskey = {
      id: 'abc',
      publicKey: toBase64Url(await crypto.subtle.exportKey('spki', pair.publicKey)),
      alg: -7,
      createdAt: 0,
    };
    const sign = async (data: Uint8Array<ArrayBuffer>) =>
      rawToDer(
        new Uint8Array(
          await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, data),
        ),
      );
    expect(await verifyAssertion(key, await ceremony(sign))).toBe(true);
    // No Face ID or fingerprint (user verified flag off), another site, a stale challenge.
    expect(await verifyAssertion(key, await ceremony(sign, { flags: 0x01 }))).toBe(false);
    expect(
      await verifyAssertion(key, await ceremony(sign, { origin: 'https://evil.example' })),
    ).toBe(false);
    expect(await verifyAssertion(key, await ceremony(sign, { type: 'webauthn.create' }))).toBe(
      false,
    );
    expect(
      await verifyAssertion(key, await ceremony(sign, { challenge: new Uint8Array(32) })),
    ).toBe(false);
    // Someone else's key.
    const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const forged = async (data: Uint8Array<ArrayBuffer>) =>
      rawToDer(
        new Uint8Array(
          await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, other.privateKey, data),
        ),
      );
    expect(await verifyAssertion(key, await ceremony(forged))).toBe(false);
  });

  it('accepts RS256 too, and reads DER signatures with leading zeros', async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const key: LockPasskey = {
      id: 'rsa',
      publicKey: toBase64Url(await crypto.subtle.exportKey('spki', pair.publicKey)),
      alg: -257,
      createdAt: 0,
    };
    const sign = async (data: Uint8Array<ArrayBuffer>) =>
      new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, data));
    expect(await verifyAssertion(key, await ceremony(sign))).toBe(true);
    const raw = new Uint8Array(64);
    raw[31] = 7;
    raw[32] = 0x90;
    expect(derToRaw(rawToDer(raw))).toEqual(raw);
    expect(derToRaw(new Uint8Array([0x31, 0]))).toBeNull();
  });
});
