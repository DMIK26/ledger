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
import type { Note } from '../domain/notes';
import type { Sketch } from '../domain/sketch';
import type { Favourite } from '../domain/repeat';
import type { Account, Flow } from '../domain/accounts';
import type { Person, UdhaarEntry } from '../domain/udhaar';
import type { Loan } from '../domain/loans';
import { FAVOURITES_KEY, NO_SPEND_KEY } from './commands';
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
    /** Added in Drop 6. */
    notes?: Note[];
    sketches?: Sketch[];
    /** Added in Drop 8. */
    favourites?: Favourite[];
    noSpendDays?: string[];
    /** Added in Drop 9. */
    accounts?: Account[];
    flows?: Flow[];
    people?: Person[];
    udhaar?: UdhaarEntry[];
    loans?: Loan[];
  };
}

const listOf = async <T>(db: Db, key: string): Promise<T[]> => {
  const v = await db.get('settings', key);
  return Array.isArray(v) ? (v as T[]) : [];
};

/** Merges two favourite lists: everything in `have`, then what `extra` adds that is not already there. */
export function mergeFavourites(have: Favourite[], extra: Favourite[]): Favourite[] {
  const ids = new Set(have.map((f) => f.id));
  return [...have, ...extra.filter((f) => !ids.has(f.id))];
}

export const mergeDays = (have: string[], extra: string[]): string[] =>
  [...new Set([...have, ...extra])].sort();

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
      notes: await db.getAll('notes'),
      sketches: await db.getAll('sketches'),
      favourites: await listOf<Favourite>(db, FAVOURITES_KEY),
      noSpendDays: await listOf<string>(db, NO_SPEND_KEY),
      accounts: await db.getAll('accounts'),
      flows: await db.getAll('flows'),
      people: await db.getAll('people'),
      udhaar: await db.getAll('udhaar'),
      loans: await db.getAll('loans'),
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
  const { notes, sketches } = json.data;
  if (
    notes !== undefined &&
    !(
      Array.isArray(notes) &&
      notes.every((n) => isObj(n) && typeof n.id === 'string' && typeof n.anchor === 'string')
    )
  )
    return null;
  if (
    sketches !== undefined &&
    !(
      Array.isArray(sketches) &&
      sketches.every((k) => isObj(k) && typeof k.id === 'string' && Array.isArray(k.strokes))
    )
  )
    return null;
  const { favourites, noSpendDays } = json.data;
  if (
    favourites !== undefined &&
    !(
      Array.isArray(favourites) &&
      favourites.every(
        (f) =>
          isObj(f) &&
          typeof f.id === 'string' &&
          typeof f.merchant === 'string' &&
          Number.isInteger(f.amountMinor) &&
          typeof f.categoryId === 'string',
      )
    )
  )
    return null;
  if (
    noSpendDays !== undefined &&
    !(
      Array.isArray(noSpendDays) &&
      noSpendDays.every((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    )
  )
    return null;
  // Drop 9 lists: rows with an id, and whole-number amounts where they carry money.
  const rowsOk = (v: unknown, money: boolean): boolean =>
    v === undefined ||
    (Array.isArray(v) &&
      v.every(
        (r) =>
          isObj(r) &&
          typeof r.id === 'string' &&
          (!money || Number.isInteger(r.amountMinor ?? r.principalMinor ?? r.openingMinor)),
      ));
  const d = json.data;
  if (
    !rowsOk(d.accounts, true) ||
    !rowsOk(d.flows, true) ||
    !rowsOk(d.people, false) ||
    !rowsOk(d.udhaar, true) ||
    !rowsOk(d.loans, true)
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
    [
      'transactions',
      'categories',
      'rules',
      'settings',
      'budgets',
      'recurring',
      'notes',
      'sketches',
      'accounts',
      'flows',
      'people',
      'udhaar',
      'loans',
    ],
    'readwrite',
  );
  for (const name of ['accounts', 'flows', 'people', 'udhaar', 'loans'] as const) {
    if (mode === 'replace') await t.objectStore(name).clear();
    for (const row of (file.data[name] ?? []) as Array<{ id: string }>) {
      if (mode === 'replace' || !(await t.objectStore(name).get(row.id)))
        await t.objectStore(name).put(row as never);
    }
  }
  for (const n of file.data.notes ?? []) {
    if (!(await t.objectStore('notes').get(n.id))) await t.objectStore('notes').put(n);
  }
  for (const k of file.data.sketches ?? []) {
    if (!(await t.objectStore('sketches').get(k.id))) await t.objectStore('sketches').put(k);
  }
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
  // Favourites and no-spend days are only ever added to, like notes.
  const favs = (await t.objectStore('settings').get(FAVOURITES_KEY)) as Favourite[] | undefined;
  await t
    .objectStore('settings')
    .put(mergeFavourites(favs ?? [], file.data.favourites ?? []), FAVOURITES_KEY);
  const days = (await t.objectStore('settings').get(NO_SPEND_KEY)) as string[] | undefined;
  await t.objectStore('settings').put(mergeDays(days ?? [], file.data.noSpendDays ?? []), NO_SPEND_KEY);
  if (mode === 'replace') {
    for (const [key, value] of Object.entries(file.data.settings)) {
      await t.objectStore('settings').put(value, key);
    }
  }
  await t.done;
  return added;
}
