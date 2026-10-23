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
import type { Goal } from '../domain/goals';
import type { WishItem } from '../domain/wishlist';
import type { Asset } from '../domain/networth';
import type { Project } from '../domain/projects';
import type { CustomRule } from '../domain/rules';
import type { SavedReport } from '../domain/reports';
import {
  CLOSED_MONTHS_KEY,
  CUSTOM_RULES_KEY,
  FAVOURITES_KEY,
  NO_SPEND_KEY,
  SAVED_REPORTS_KEY,
  SETTLED_SPLITS_KEY,
} from './commands';
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
    /** Added in Drop 10. */
    goals?: Goal[];
    wishlist?: WishItem[];
    assets?: Asset[];
    closedMonths?: string[];
    /** Added in Drop 11. */
    settledSplits?: string[];
    /** Added in Drop 12. */
    projects?: Project[];
    customRules?: CustomRule[];
    savedReports?: SavedReport[];
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

/** Everything in `have`, then the rows of `extra` whose id is new (rules keep their order). */
export const mergeById = <T extends { id: string }>(have: T[], extra: T[]): T[] => {
  const ids = new Set(have.map((x) => x.id));
  return [...have, ...extra.filter((x) => !ids.has(x.id))];
};

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
      goals: await db.getAll('goals'),
      wishlist: await db.getAll('wishlist'),
      assets: await db.getAll('assets'),
      closedMonths: await listOf<string>(db, CLOSED_MONTHS_KEY),
      settledSplits: await listOf<string>(db, SETTLED_SPLITS_KEY),
      projects: await db.getAll('projects'),
      customRules: await listOf<CustomRule>(db, CUSTOM_RULES_KEY),
      savedReports: await listOf<SavedReport>(db, SAVED_REPORTS_KEY),
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
          (!money ||
            Number.isInteger(
              r.amountMinor ?? r.principalMinor ?? r.openingMinor ?? r.targetMinor ?? r.priceMinor,
            )),
      ));
  const d = json.data;
  if (
    !rowsOk(d.accounts, true) ||
    !rowsOk(d.flows, true) ||
    !rowsOk(d.people, false) ||
    !rowsOk(d.udhaar, true) ||
    !rowsOk(d.loans, true) ||
    !rowsOk(d.goals, true) ||
    !rowsOk(d.wishlist, true) ||
    !rowsOk(d.assets, false) ||
    !rowsOk(d.projects, false)
  )
    return null;
  // Drop 12 lists: rules carry their text and what they set; saved reports their range.
  const listOk = (v: unknown, check: (x: Record<string, unknown>) => boolean): boolean =>
    v === undefined ||
    (Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string' && check(x)));
  if (
    !listOk(d.customRules, (r) => typeof r.text === 'string' && isObj(r.set)) ||
    !listOk(d.savedReports, (r) => typeof r.name === 'string' && isObj(r.range))
  )
    return null;
  // Drop 10: goal contributions and asset values carry money too.
  const moneyRows = (v: unknown): boolean =>
    Array.isArray(v) &&
    v.every(
      (x) =>
        isObj(x) && typeof x.date === 'string' && Number.isInteger(x.amountMinor ?? x.valueMinor),
    );
  if (Array.isArray(d.goals) && !d.goals.every((g) => isObj(g) && moneyRows(g.contributions)))
    return null;
  if (Array.isArray(d.assets) && !d.assets.every((a) => isObj(a) && moneyRows(a.values)))
    return null;
  if (
    d.settledSplits !== undefined &&
    !(Array.isArray(d.settledSplits) && d.settledSplits.every((x) => typeof x === 'string'))
  )
    return null;
  if (
    d.closedMonths !== undefined &&
    !(
      Array.isArray(d.closedMonths) &&
      d.closedMonths.every((m) => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m))
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
      'goals',
      'wishlist',
      'assets',
      'projects',
    ],
    'readwrite',
  );
  for (const name of [
    'accounts',
    'flows',
    'people',
    'udhaar',
    'loans',
    'goals',
    'wishlist',
    'assets',
    'projects',
  ] as const) {
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
  await t
    .objectStore('settings')
    .put(mergeDays(days ?? [], file.data.noSpendDays ?? []), NO_SPEND_KEY);
  const settled = (await t.objectStore('settings').get(SETTLED_SPLITS_KEY)) as string[] | undefined;
  await t
    .objectStore('settings')
    .put(mergeDays(settled ?? [], file.data.settledSplits ?? []), SETTLED_SPLITS_KEY);
  const closed = (await t.objectStore('settings').get(CLOSED_MONTHS_KEY)) as string[] | undefined;
  await t
    .objectStore('settings')
    .put(mergeDays(closed ?? [], file.data.closedMonths ?? []), CLOSED_MONTHS_KEY);
  for (const [key, extra] of [
    [CUSTOM_RULES_KEY, file.data.customRules],
    [SAVED_REPORTS_KEY, file.data.savedReports],
  ] as const) {
    const have = (await t.objectStore('settings').get(key)) as Array<{ id: string }> | undefined;
    const list =
      mode === 'replace' ? [...(extra ?? [])] : mergeById(have ?? [], [...(extra ?? [])]);
    await t.objectStore('settings').put(list, key);
  }
  if (mode === 'replace') {
    for (const [key, value] of Object.entries(file.data.settings)) {
      await t.objectStore('settings').put(value, key);
    }
  }
  await t.done;
  return added;
}
