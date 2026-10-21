import { isValidYMD } from '../domain/dates';
import {
  DEFAULT_SETTINGS,
  type Budget,
  type Category,
  type MerchantRule,
  type Settings,
  type Transaction,
} from '../domain/types';
import type { RecurringItem } from '../domain/recurring';
import { DB_VERSION, type Db } from './db';

export interface BackupFile {
  app: 'ledger';
  schemaVersion: number;
  exportedAt: string;
  data: {
    transactions: Transaction[];
    categories: Category[];
    rules: MerchantRule[];
    settings: Settings;
    /** Added in Drop 3; older backups have none. */
    budgets?: Budget[];
    /** Added in Drop 4. */
    recurring?: RecurringItem[];
  };
}

export async function loadSettings(db: Db): Promise<Settings> {
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = await db.get('settings', key);
    if (value !== undefined) settings[key] = value;
  }
  return settings as unknown as Settings;
}

export async function exportBackup(db: Db): Promise<BackupFile> {
  return {
    app: 'ledger',
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      transactions: await db.getAll('transactions'),
      categories: await db.getAll('categories'),
      rules: await db.getAll('rules'),
      settings: await loadSettings(db),
      budgets: await db.getAll('budgets'),
      recurring: await db.getAll('recurring'),
    },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function validTransaction(t: unknown): t is Transaction {
  if (!isObj(t)) return false;
  const m = typeof t.date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.date) : null;
  return (
    typeof t.id === 'string' &&
    m !== null &&
    isValidYMD(Number(m[1]), Number(m[2]), Number(m[3])) &&
    Number.isInteger(t.amountMinor) &&
    typeof t.merchant === 'string' &&
    typeof t.categoryId === 'string'
  );
}

/** Returns the backup when it is a genuine Ledger backup, otherwise null. Nothing is half-imported. */
export function validateBackup(json: unknown): BackupFile | null {
  if (!isObj(json) || json.app !== 'ledger' || !isObj(json.data)) return null;
  const { transactions, categories, rules } = json.data;
  if (!Array.isArray(transactions) || !transactions.every(validTransaction)) return null;
  if (!Array.isArray(categories) || !categories.every((c) => isObj(c) && typeof c.id === 'string'))
    return null;
  if (!Array.isArray(rules)) return null;
  const { budgets } = json.data;
  if (
    budgets !== undefined &&
    !(
      Array.isArray(budgets) &&
      budgets.every((b) => isObj(b) && typeof b.id === 'string' && Number.isInteger(b.amountMinor))
    )
  )
    return null;
  const { recurring } = json.data;
  if (
    recurring !== undefined &&
    !(
      Array.isArray(recurring) &&
      recurring.every(
        (r) =>
          isObj(r) &&
          typeof r.id === 'string' &&
          Number.isInteger(r.amountMinor) &&
          typeof r.anchor === 'string',
      )
    )
  )
    return null;
  return json as unknown as BackupFile;
}

/** `merge` adds what is missing; `replace` makes the device match the backup exactly. */
export async function importBackup(
  db: Db,
  file: BackupFile,
  mode: 'merge' | 'replace',
): Promise<number> {
  const t = db.transaction(
    ['transactions', 'categories', 'rules', 'settings', 'budgets', 'recurring'],
    'readwrite',
  );
  if (mode === 'replace') {
    await Promise.all([
      t.objectStore('transactions').clear(),
      t.objectStore('categories').clear(),
      t.objectStore('rules').clear(),
      t.objectStore('budgets').clear(),
      t.objectStore('recurring').clear(),
    ]);
  }
  for (const r of file.data.recurring ?? []) {
    if (mode === 'replace' || !(await t.objectStore('recurring').get(r.id))) {
      await t.objectStore('recurring').put(r);
    }
  }
  for (const b of file.data.budgets ?? []) {
    if (mode === 'replace' || !(await t.objectStore('budgets').get(b.id))) {
      await t.objectStore('budgets').put(b);
    }
  }
  let added = 0;
  for (const c of file.data.categories) {
    if (mode === 'replace' || !(await t.objectStore('categories').get(c.id))) {
      await t.objectStore('categories').put(c);
    }
  }
  for (const tx of file.data.transactions) {
    if (mode === 'replace' || !(await t.objectStore('transactions').get(tx.id))) {
      await t.objectStore('transactions').put(tx);
      added += 1;
    }
  }
  for (const r of file.data.rules) await t.objectStore('rules').put(r);
  if (mode === 'replace') {
    for (const [key, value] of Object.entries(file.data.settings)) {
      await t.objectStore('settings').put(value, key);
    }
  }
  await t.done;
  return added;
}
