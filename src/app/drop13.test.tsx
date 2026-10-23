import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setWriteSpace } from '../data/commands';
import { useLedger, type EntryDraft } from '../data/store';
import { isProtectedBackup, openBackup } from '../domain/backupCrypto';
import { fmtDate, monthLabel } from '../domain/dates';
import { getLanguage, tl } from '../domain/i18n';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { useUi } from '../kit/ui';
import { useView } from '../kit/view';
import { App } from './App';
import { BackupReminder } from './BackupReminder';

const NOW = new Date(2026, 9, 22, 12, 0, 0); // Thu 22 Oct 2026

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  date: '2026-10-18',
  amountMinor: 50_000,
  merchant: 'Shawarma',
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
  ...over,
});

/** Files handed to the share sheet. */
let shared: File[] = [];

beforeAll(async () => {
  await useLedger.getState().init();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  shared = [];
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(navigator, 'share', {
    value: async (data: ShareData) => {
      shared.push(...(data.files ?? []));
    },
    configurable: true,
  });
  const db = useLedger.getState().getDb();
  for (const store of [
    'transactions',
    'rules',
    'trash',
    'budgets',
    'recurring',
    'udhaar',
    'people',
    'projects',
    'flows',
    'accounts',
    'categories',
  ] as const)
    await db.clear(store);
  for (const c of DEFAULT_CATEGORIES) await db.put('categories', c);
  await act(async () => {
    const s = useLedger.getState();
    await s.setSetting('privacy', false);
    await s.setSetting('addMode', 'form');
    await s.setSetting('shopName', 'Shop');
    await s.setSetting('lastBackupAt', 0);
    await s.setSetting('folderBackupName', '');
    await s.setSetting('folderBackupAt', 0);
    // Last, as it reloads every list from storage.
    await s.setSetting('spacesOn', false);
    await s.setSetting('space', 'personal');
    useLedger.setState({ notice: null });
  });
  useUi.setState({ paletteOpen: false, recap: null, customising: false });
  useView.setState({ pins: [], month: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setWriteSpace('personal');
  window.location.hash = '';
});

const go = async (hash: string) => {
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
};

const seed = async (...entries: Array<Partial<EntryDraft>>) => {
  await act(async () => {
    for (const e of entries) await useLedger.getState().addEntry(draft(e));
  });
};

const rows = () => screen.queryAllByTestId('tx-row');

describe('spaces', () => {
  it('turn on in Settings, switch on every page, and keep each ledger apart', async () => {
    await seed({ merchant: 'Groceries' });
    await go('#/settings');
    expect(screen.queryByRole('group', { name: 'Ledger' })).toBeNull();
    await userEvent.click(screen.getByLabelText('Keep a Shop ledger as well'));
    const name = screen.getByLabelText('The shop’s name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Ravi Hardware{Enter}');
    const switcher = await screen.findByRole('group', { name: 'Ledger' });
    expect(within(switcher).getByRole('button', { name: 'Ravi Hardware' })).toBeInTheDocument();

    await userEvent.click(within(switcher).getByRole('button', { name: 'Ravi Hardware' }));
    await act(async () => {
      await useLedger.getState().addEntry(draft({ merchant: 'Cement', categoryId: 'business' }));
    });
    cleanup();
    await go('#/transactions');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Cement');
    await userEvent.click(screen.getByRole('button', { name: 'Both' }));
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Personal' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Groceries');
  });

  it('move selected entries to the shop, and Budgets asks for a space in Both', async () => {
    await act(async () => {
      await useLedger.getState().setSetting('spacesOn', true);
      await useLedger.getState().setSetting('shopName', 'Ravi Hardware');
    });
    await seed({ merchant: 'Groceries' }, { merchant: 'Paint', categoryId: 'business' });
    await go('#/transactions');
    await userEvent.click(screen.getByRole('checkbox', { name: /Select Paint/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Move to Ravi Hardware' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(useLedger.getState().notice).toBe('Moved 1 entry to Ravi Hardware');
    await userEvent.click(screen.getByRole('button', { name: 'Ravi Hardware' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Paint');
    cleanup();
    await act(async () => {
      await useLedger.getState().setSetting('space', 'both');
    });
    await go('#/budgets');
    expect(screen.getByTestId('pick-space')).toBeInTheDocument();
  });

  it('show profit and loss for the shop in Reports', async () => {
    await act(async () => {
      const s = useLedger.getState();
      await s.setSetting('spacesOn', true);
      await s.setSetting('shopName', 'Ravi Hardware');
      await s.setSetting('space', 'shop');
      await s.addEntry(draft({ merchant: 'Stock', amountMinor: 600_000, categoryId: 'business' }));
      await s.addIncome({
        date: '2026-10-10',
        amountMinor: 1_000_000,
        label: 'Sales',
        incomeKind: 'business',
      });
    });
    await go('#/reports');
    const card = await screen.findByTestId('profit-loss');
    expect(card).toHaveTextContent('Ravi Hardware: profit and loss');
    expect(within(card).getByTestId('pl-profit')).toHaveTextContent('₹4,000.00');
    expect(within(card).getByTestId('pl-profit')).toHaveTextContent('40% of sales');
  });
});

describe('backups', () => {
  it('protect the file with a password, and restoring asks for it', async () => {
    await seed({ merchant: 'Shawarma' });
    await go('#/settings');
    await userEvent.click(screen.getByLabelText('Protect the backup with a password'));
    const button = screen.getByRole('button', { name: 'Export protected backup' });
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    expect(screen.getByTestId('password-note')).toHaveTextContent('Use at least 8 characters.');
    expect(button).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Password'), 'mango lassi');
    await userEvent.type(screen.getByLabelText('Type it again'), 'mango lassi');
    expect(screen.getByTestId('password-note')).toHaveTextContent(
      'Ledger never keeps this password',
    );
    await userEvent.click(button);
    await waitFor(() => expect(shared).toHaveLength(1), { timeout: 5000 });
    const text = await shared[0]!.text();
    expect(text).not.toContain('Shawarma');
    const parsed: unknown = JSON.parse(text);
    expect(isProtectedBackup(parsed)).toBe(true);
    expect(await openBackup(parsed as never, 'mango lassi')).toContain('Shawarma');
    expect(useLedger.getState().settings.lastBackupAt).toBe(NOW.getTime());
    // Nothing about the password is kept.
    const db = useLedger.getState().getDb();
    for (const key of await db.getAllKeys('settings'))
      expect(JSON.stringify(await db.get('settings', key))).not.toContain('mango');

    await userEvent.upload(screen.getByLabelText('Restore from backup'), shared[0]!);
    const ask = await screen.findByTestId('backup-password');
    await userEvent.type(within(ask).getByLabelText('Its password'), 'wrong one');
    await userEvent.click(within(ask).getByRole('button', { name: 'Open backup' }));
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'That password does not open this backup.',
    );
    await userEvent.clear(within(ask).getByLabelText('Its password'));
    await userEvent.type(within(ask).getByLabelText('Its password'), 'mango lassi');
    await userEvent.click(within(ask).getByRole('button', { name: 'Open backup' }));
    expect(await screen.findByTestId('restore-preview', {}, { timeout: 5000 })).toHaveTextContent(
      'This backup has 1 entry',
    );
  });

  it('the weekly reminder backs up with one tap', async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes('coarse'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      await seed({ merchant: 'Shawarma' });
      render(<BackupReminder />);
      const banner = screen.getByTestId('backup-reminder');
      await userEvent.click(within(banner).getByRole('button', { name: 'Back up now' }));
      await waitFor(() => expect(shared).toHaveLength(1));
      expect(shared[0]!.name).toBe('ledger-backup-2026-10-22.json');
      expect(await shared[0]!.text()).toContain('Shawarma');
      await waitFor(() => expect(screen.queryByTestId('backup-reminder')).toBeNull());
      expect(useLedger.getState().settings.lastBackupAt).toBe(NOW.getTime());
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  it('back up to a chosen folder, then by itself once a week', async () => {
    const written: Array<[string, string]> = [];
    let permission: 'granted' | 'prompt' = 'granted';
    const handle = {
      name: 'Backups',
      queryPermission: async () => permission,
      requestPermission: async () => {
        permission = 'granted';
        return permission;
      },
      getFileHandle: async (name: string) => ({
        createWritable: async () => ({
          write: async (d: Blob) => {
            written.push([name, await d.text()]);
          },
          close: async () => {},
        }),
      }),
    };
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: async () => handle,
      configurable: true,
    });
    try {
      await seed({ merchant: 'Shawarma' });
      await go('#/settings');
      const folder = screen.getByTestId('folder-backup');
      await userEvent.click(within(folder).getByRole('button', { name: 'Choose a folder' }));
      await waitFor(() => expect(written).toHaveLength(1));
      expect(written[0]![0]).toBe('ledger-backup-2026-10-22.json');
      expect(written[0]![1]).toContain('Shawarma');
      await waitFor(() => expect(folder).toHaveTextContent('Backing up to Backups once a week'));
      expect(useLedger.getState().settings.folderBackupAt).toBe(NOW.getTime());
      cleanup();

      // Eight days on, opening Ledger writes the next one; when the browser wants permission, one tap.
      vi.setSystemTime(new Date(2026, 9, 30, 12, 0, 0));
      await go('#/');
      await waitFor(() => expect(written).toHaveLength(2));
      expect(written[1]![0]).toBe('ledger-backup-2026-10-30.json');
      cleanup();
      vi.setSystemTime(new Date(2026, 10, 7, 12, 0, 0));
      permission = 'prompt';
      await go('#/');
      const ask = await screen.findByTestId('folder-backup-ask');
      await userEvent.click(within(ask).getByRole('button', { name: 'Back up' }));
      await waitFor(() => expect(written).toHaveLength(3));
      await waitFor(() => expect(screen.queryByTestId('folder-backup-ask')).toBeNull());
      cleanup();

      await go('#/settings');
      await userEvent.click(
        within(screen.getByTestId('folder-backup')).getByRole('button', { name: 'Turn off' }),
      );
      await waitFor(() => expect(useLedger.getState().settings.folderBackupName).toBe(''));
    } finally {
      Reflect.deleteProperty(window, 'showDirectoryPicker');
    }
  });
});

describe('app badge', () => {
  it('shows the bills due this week on the icon, and clears when off', async () => {
    const calls: Array<number | 'clear'> = [];
    Object.defineProperty(navigator, 'setAppBadge', {
      value: async (n: number) => {
        calls.push(n);
      },
      configurable: true,
    });
    Object.defineProperty(navigator, 'clearAppBadge', {
      value: async () => {
        calls.push('clear');
      },
      configurable: true,
    });
    try {
      await act(async () => {
        await useLedger.getState().saveRecurring({
          id: 'rent',
          merchant: 'Rent',
          categoryId: 'bills',
          method: 'UPI',
          amountMinor: 2_000_000,
          cadence: 'monthly',
          anchor: '2026-09-25',
          createdAt: 0,
        });
      });
      await go('#/settings');
      await userEvent.click(
        screen.getByRole('switch', { name: 'Bills due this week on the app icon' }),
      );
      await waitFor(() => expect(calls.at(-1)).toBe(1));
      await userEvent.click(
        screen.getByRole('switch', { name: 'Bills due this week on the app icon' }),
      );
      await waitFor(() => expect(calls.at(-1)).toBe('clear'));
    } finally {
      await act(async () => {
        await useLedger.getState().setSetting('appBadge', false);
      });
      Reflect.deleteProperty(navigator, 'setAppBadge');
      Reflect.deleteProperty(navigator, 'clearAppBadge');
    }
  });
});

describe('Face ID or fingerprint', () => {
  it('makes a passkey in Settings and unlocks with it; the PIN still works', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
    const sha = async (b: Uint8Array) =>
      new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>));
    const b64url = (b: Uint8Array) =>
      btoa(String.fromCharCode(...b))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    const der = (raw: Uint8Array) => {
      const int = (v: Uint8Array) => {
        let i = 0;
        while (i < v.length - 1 && v[i] === 0) i += 1;
        const x = v.subarray(i);
        return x[0]! & 0x80 ? [0x02, x.length + 1, 0, ...x] : [0x02, x.length, ...x];
      };
      const body = [...int(raw.subarray(0, 32)), ...int(raw.subarray(32))];
      return new Uint8Array([0x30, body.length, ...body]);
    };
    let verified = true;
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: async () => ({
          rawId: new Uint8Array([1, 2, 3]).buffer,
          response: { getPublicKey: () => spki, getPublicKeyAlgorithm: () => -7 },
        }),
        get: async (o: { publicKey: { challenge: Uint8Array } }) => {
          const authenticatorData = new Uint8Array([
            ...(await sha(new TextEncoder().encode(window.location.hostname))),
            verified ? 0x05 : 0x01,
            0,
            0,
            0,
            1,
          ]);
          const clientDataJSON = new TextEncoder().encode(
            JSON.stringify({
              type: 'webauthn.get',
              challenge: b64url(o.publicKey.challenge),
              origin: window.location.origin,
            }),
          );
          const signed = new Uint8Array([...authenticatorData, ...(await sha(clientDataJSON))]);
          const raw = new Uint8Array(
            await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, signed),
          );
          return {
            response: { authenticatorData, clientDataJSON, signature: der(raw) },
          };
        },
      },
    });
    try {
      await act(async () => {
        await useLedger.getState().setPin('2468');
        useLedger.setState({ locked: false });
      });
      await go('#/settings');
      const setting = await screen.findByTestId('passkey-setting');
      expect(setting).toHaveTextContent('Not yet tried on a real iPhone home-screen app.');
      await userEvent.click(within(setting).getByLabelText('Unlock with Face ID or fingerprint'));
      await waitFor(() => expect(useLedger.getState().lockPasskey?.alg).toBe(-7));

      act(() => useLedger.getState().lockNow());
      // Without Face ID passing (user not verified), it stays locked.
      verified = false;
      await userEvent.click(
        await screen.findByRole('button', { name: 'Use Face ID or fingerprint' }),
      );
      expect(await screen.findByText(/That did not unlock Ledger/)).toBeInTheDocument();
      expect(useLedger.getState().locked).toBe(true);
      verified = true;
      await userEvent.click(screen.getByRole('button', { name: 'Use Face ID or fingerprint' }));
      await waitFor(() => expect(useLedger.getState().locked).toBe(false));

      act(() => useLedger.getState().lockNow());
      await userEvent.type(await screen.findByLabelText('Enter your PIN'), '2468{Enter}');
      await waitFor(() => expect(useLedger.getState().locked).toBe(false));
      // Turning the PIN off removes the passkey too.
      await act(async () => {
        await useLedger.getState().removePin('2468');
      });
      expect(useLedger.getState().lockPasskey).toBeNull();
      expect(await useLedger.getState().getDb().get('settings', 'lockPasskey')).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, 'credentials');
      Reflect.deleteProperty(window, 'isSecureContext');
      if (useLedger.getState().lock) {
        await act(async () => {
          await useLedger.getState().removePin('2468');
        });
      }
    }
  });
});

describe('Telugu and Hindi', () => {
  it('switch every screen, keep amounts in Western digits, and switch back', async () => {
    await seed({ merchant: 'Shawarma', amountMinor: 125_000 });
    try {
      await go('#/settings');
      await userEvent.click(screen.getByTestId('language-te'));
      await waitFor(() => expect(document.documentElement.lang).toBe('te'));
      expect(getLanguage()).toBe('te');
      // The page re-draws in Telugu.
      expect(await screen.findByRole('heading', { level: 1, name: 'సెట్టింగ్‌లు' })).toBeVisible();
      expect(screen.getByRole('heading', { name: 'రూపం' })).toBeVisible();
      expect(fmtDate('2026-10-22')).toBe('22 అక్టో 2026');
      expect(monthLabel('2026-10')).toBe('అక్టోబర్ 2026');
      // Anything without a translation stays English.
      expect(tl('Not a translated sentence {0}', 3)).toBe('Not a translated sentence 3');
      cleanup();

      await go('#/transactions');
      const row = (await screen.findAllByTestId('tx-row'))[0]!;
      expect(row).toHaveTextContent('₹1,250.00');
      expect(row).toHaveTextContent('భోజనం, హోటళ్లు');
      expect(row).toHaveTextContent('UPI');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('లావాదేవీలు');
      cleanup();

      await act(async () => {
        await useLedger.getState().setSetting('language', 'hi');
      });
      await go('#/');
      expect(document.documentElement.lang).toBe('hi');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('डैशबोर्ड');
      expect(screen.getByLabelText('क्विक ऐड')).toBeInTheDocument();
      // Built-in category names stay English underneath.
      const stored = await useLedger.getState().getDb().get('categories', 'food');
      expect(stored?.name).toBe('Food & Dining');
    } finally {
      await act(async () => {
        await useLedger.getState().setSetting('language', 'en');
      });
    }
    expect(document.documentElement.lang).toBe('en-IN');
    expect(tl('Settings')).toBe('Settings');
  });
});
