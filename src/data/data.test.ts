import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { parseQuickEntry } from '../domain/parser';
import { AUDIT_LIMIT, CommandBus, purgeTrash } from './bus';
import { addTransaction, deleteTransaction } from './commands';
import { DB_VERSION, openLedgerDB } from './db';
import { exportBackup, importBackup, validateBackup } from './backup';
import { parseLegacy, readLegacyFromStorage } from './legacyImport';
import { createLedgerStore } from './store';
import type { Transaction } from '../domain/types';

let counter = 0;
const freshName = () => `test-db-${(counter += 1)}-${Math.random().toString(36).slice(2)}`;

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: crypto.randomUUID(),
  date: '2026-10-18',
  amountMinor: 50000,
  currency: 'INR',
  merchant: 'Shawarma',
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
  source: 'quick',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('database and migrations', () => {
  it('creates the v1 schema', async () => {
    const db = await openLedgerDB(freshName());
    expect(DB_VERSION).toBe(1);
    expect([...db.objectStoreNames]).toEqual(
      expect.arrayContaining(['transactions', 'categories', 'rules', 'settings', 'audit', 'trash', 'receipts']),
    );
    db.close();
  });
});

describe('command bus', () => {
  it('undoes and redoes, and writes every step to the audit log', async () => {
    const db = await openLedgerDB(freshName());
    const bus = new CommandBus(db, () => undefined);
    const t = tx();
    await bus.run(addTransaction(t));
    expect(await db.count('transactions')).toBe(1);
    await bus.undo();
    expect(await db.count('transactions')).toBe(0);
    await bus.redo();
    expect(await db.get('transactions', t.id)).toEqual(t);
    const audit = await db.getAll('audit');
    expect(audit.map((a) => a.action)).toEqual(['do', 'undo', 'redo']);
  });

  it('keeps only the newest 500 audit events', async () => {
    const db = await openLedgerDB(freshName());
    const bus = new CommandBus(db, () => undefined);
    for (let i = 0; i < AUDIT_LIMIT + 8; i += 1) await bus.run(addTransaction(tx({ merchant: `M${i}` })));
    expect(await db.count('audit')).toBe(AUDIT_LIMIT);
  });

  it('moves deletes to trash, restores them on undo, and purges old trash', async () => {
    const db = await openLedgerDB(freshName());
    const bus = new CommandBus(db, () => undefined);
    const t = tx();
    await bus.run(addTransaction(t));
    await bus.run(deleteTransaction(t, 1_000));
    expect(await db.count('transactions')).toBe(0);
    expect(await db.count('trash')).toBe(1);
    await bus.undo();
    expect(await db.count('transactions')).toBe(1);
    expect(await db.count('trash')).toBe(0);
    await bus.redo();
    expect(await purgeTrash(db, 1_000 + 29 * 86_400_000)).toBe(0);
    expect(await purgeTrash(db, 1_000 + 31 * 86_400_000)).toBe(1);
  });
});

describe('ledger store', () => {
  it('seeds categories and adds a parsed quick entry on the right date', async () => {
    const store = createLedgerStore(freshName());
    await store.getState().init();
    expect(store.getState().categories).toHaveLength(DEFAULT_CATEGORIES.length);
    const parsed = parseQuickEntry('shawarma 500 on 18th oct upi', { today: '2026-10-19' });
    await store.getState().addFromParsed(parsed);
    const [saved] = store.getState().transactions;
    expect(saved).toMatchObject({ merchant: 'Shawarma', date: '2026-10-18', amountMinor: 50000, categoryId: 'food' });
    expect(saved?.raw).toBe('shawarma 500 on 18th oct upi');
  });

  it('learns a rule when the category is changed, and undo removes both', async () => {
    const store = createLedgerStore(freshName());
    await store.getState().init();
    const parsed = parseQuickEntry('zzz 90', { today: '2026-10-19' });
    expect(parsed.unsure).toBe(true);
    await store.getState().addFromParsed(parsed, 'entertainment');
    expect(store.getState().rules).toEqual({ zzz: 'entertainment' });
    expect(store.getState().transactions[0]?.unsure).toBe(false);
    await store.getState().undo();
    expect(store.getState().transactions).toHaveLength(0);
    expect(store.getState().rules).toEqual({});
  });

  it('refuses to save an entry that failed to parse', async () => {
    const store = createLedgerStore(freshName());
    await store.getState().init();
    await store.getState().addFromParsed(parseQuickEntry('lunch 150 31 sep', { today: '2026-10-19' }));
    expect(store.getState().transactions).toHaveLength(0);
  });
});

describe('backup', () => {
  it('round-trips with identical totals and rejects damaged files', async () => {
    const store = createLedgerStore(freshName());
    await store.getState().init();
    for (const text of ['chai 20', 'rent 8000 1/9', 'film 200 18th'])
      await store.getState().addFromParsed(parseQuickEntry(text, { today: '2026-10-19' }));
    const file = await exportBackup(store.getState().getDb());
    const total = (list: Transaction[]) => list.reduce((s, t) => s + t.amountMinor, 0);

    const other = createLedgerStore(freshName());
    await other.getState().init();
    const checked = validateBackup(JSON.parse(JSON.stringify(file)));
    expect(checked).not.toBeNull();
    await importBackup(other.getState().getDb(), checked!, 'replace');
    const restored = await other.getState().getDb().getAll('transactions');
    expect(total(restored)).toBe(total(file.data.transactions));
    expect(restored).toHaveLength(3);

    expect(validateBackup({ app: 'ledger', data: { transactions: [{ id: 1 }], categories: [], rules: [] } })).toBeNull();
    expect(validateBackup({ nope: true })).toBeNull();
  });
});

describe('legacy import', () => {
  const opts = { categories: DEFAULT_CATEGORIES, now: 5, newId: (() => { let n = 0; return () => `id-${(n += 1)}`; })() };

  it('reads rupee amounts, maps categories and keeps unknown ones as new categories', () => {
    const preview = parseLegacy(
      {
        transactions: [
          { date: '2026-10-18', amount: 500, merchant: 'Shawarma', category: 'Food & Dining', method: 'UPI' },
          { date: '19/10/2026', amount: '1,200.50', merchant: 'Pottery class', category: 'Hobbies', paymentMethod: 'Cash' },
          { date: 'not a date', amount: 10, merchant: 'Bad' },
        ],
      },
      opts,
    );
    expect(preview?.unit).toBe('major');
    expect(preview?.transactions.map((t) => [t.date, t.amountMinor, t.categoryId])).toEqual([
      ['2026-10-18', 50000, 'food'],
      ['2026-10-19', 120050, 'legacy-hobbies'],
    ]);
    expect(preview?.newCategories.map((c) => c.name)).toEqual(['Hobbies']);
    expect(preview?.skipped).toBe(1);
  });

  it('detects amounts stored in paise and honours explicit minor-unit fields', () => {
    const paise = parseLegacy([{ date: '2026-10-18', amount: 5000000, merchant: 'Rent' }, { date: '2026-10-19', amount: 5000000, merchant: 'Rent' }], opts);
    expect(paise).toMatchObject({ unit: 'minor', unitDetected: true });
    expect(paise?.transactions[0]?.amountMinor).toBe(5000000);
    const explicit = parseLegacy({ expenses: [{ date: '2026-10-18', amountMinor: 50000, name: 'Chai' }] }, opts);
    expect(explicit?.transactions[0]).toMatchObject({ amountMinor: 50000, merchant: 'Chai' });
  });

  it('finds the earlier app in localStorage and ignores its own boot key', () => {
    const items: Record<string, string> = {
      'ledger.boot': '{"theme":"dark"}',
      'ledger.v1': JSON.stringify({ transactions: [{ date: '2026-10-18', amount: 20, merchant: 'Chai' }] }),
    };
    const storage = {
      get length() { return Object.keys(items).length; },
      key: (i: number) => Object.keys(items)[i] ?? null,
      getItem: (k: string) => items[k] ?? null,
    };
    expect(readLegacyFromStorage(storage)).toMatchObject({ transactions: [{ merchant: 'Chai' }] });
  });

  it('finds the data under any key name and ignores unrelated apps', () => {
    const items: Record<string, string> = {
      'some-other-app': JSON.stringify({ items: [{ title: 'Todo' }] }),
      expense_tracker_state: JSON.stringify([{ date: '2026-10-18', amount: 20, name: 'Chai' }]),
    };
    const storage = {
      get length() { return Object.keys(items).length; },
      key: (i: number) => Object.keys(items)[i] ?? null,
      getItem: (k: string) => items[k] ?? null,
    };
    expect(readLegacyFromStorage(storage)).toEqual([{ date: '2026-10-18', amount: 20, name: 'Chai' }]);
  });

  it('reads a console dump of localStorage whose values are JSON text', () => {
    const dump = {
      'ledger.v1': JSON.stringify({ transactions: [{ date: '2026-10-18', amount: 500, merchant: 'Shawarma' }] }),
    };
    const preview = parseLegacy(dump, opts);
    expect(preview?.transactions).toHaveLength(1);
    expect(preview?.transactions[0]).toMatchObject({ merchant: 'Shawarma', amountMinor: 50000, date: '2026-10-18' });
  });
});
