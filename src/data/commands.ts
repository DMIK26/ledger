import type { SavedView } from '../domain/filters';
import type { RecurringItem } from '../domain/recurring';
import type { Note } from '../domain/notes';
import type { Sketch } from '../domain/sketch';
import type { Budget, Category, MerchantRule, Transaction, TrashItem } from '../domain/types';
import type { Account, Flow } from '../domain/accounts';
import type { Loan } from '../domain/loans';
import type { Person, UdhaarEntry } from '../domain/udhaar';
import type { Goal } from '../domain/goals';
import type { WishItem } from '../domain/wishlist';
import type { Asset } from '../domain/networth';
import type { Project } from '../domain/projects';
import type { Db, LedgerDB } from './db';
import { tl } from '../domain/i18n';
import { storedCategory } from '../domain/categories';

/**
 * The space new rows are made in (Drop 13). The store sets it from the switcher, like privacy in
 * money.ts, so every new entry, account or person lands in the ledger on screen.
 */
let writeSpace: 'personal' | 'shop' = 'personal';
export const setWriteSpace = (space: 'personal' | 'shop'): void => {
  writeSpace = space;
};
export const getWriteSpace = (): 'personal' | 'shop' => writeSpace;

/** A new row gets the Shop's mark when the Shop is on screen, unless it already says where it goes. */
export function stampSpace<T extends object>(row: T): T {
  return writeSpace === 'shop' && !('space' in row) ? { ...row, space: 'shop' } : row;
}

/** Every data change is a Command, so it can be undone, redone and written to the audit log. */
export interface Command {
  label: string;
  apply(db: Db): Promise<void>;
  revert(db: Db): Promise<void>;
  /** What it touches, such as 'tx:<id>', written to the activity log for an entry's history. */
  entities?: string[];
}

export const addTransaction = (input: Transaction): Command => {
  const tx = stampSpace(input);
  return {
    label: tl('Added {0}', tx.merchant),
    entities: [`tx:${tx.id}`],
    apply: async (db) => {
      await db.put('transactions', tx);
    },
    revert: async (db) => {
      await db.delete('transactions', tx.id);
    },
  };
};

export const updateTransaction = (before: Transaction, after: Transaction): Command => ({
  label: tl('Edited {0}', after.merchant),
  entities: [`tx:${after.id}`],
  apply: async (db) => {
    await db.put('transactions', after);
  },
  revert: async (db) => {
    await db.put('transactions', before);
  },
});

/** Deleting moves the entry to Trash, where it stays restorable for 30 days. */
export const deleteTransaction = (tx: Transaction, now: number = Date.now()): Command => ({
  label: tl('Deleted {0}', tx.merchant),
  entities: [`tx:${tx.id}`],
  apply: async (db) => {
    const t = db.transaction(['transactions', 'trash'], 'readwrite');
    void t.objectStore('transactions').delete(tx.id);
    void t.objectStore('trash').put({ id: tx.id, tx, deletedAt: now });
    await t.done;
  },
  revert: async (db) => {
    const t = db.transaction(['transactions', 'trash'], 'readwrite');
    void t.objectStore('transactions').put(tx);
    void t.objectStore('trash').delete(tx.id);
    await t.done;
  },
});

export const setRule = (rule: MerchantRule, previous?: MerchantRule): Command => ({
  label: tl('Remembered {0}', rule.key),
  apply: async (db) => {
    await db.put('rules', rule);
  },
  revert: async (db) => {
    if (previous) await db.put('rules', previous);
    else await db.delete('rules', rule.key);
  },
});

export const importTransactions = (
  transactions: Transaction[],
  newCategories: Category[] = [],
  label = tl('Imported {0} entries', transactions.length),
): Command => ({
  label,
  apply: async (db) => {
    const t = db.transaction(['transactions', 'categories'], 'readwrite');
    for (const c of newCategories) void t.objectStore('categories').put(storedCategory(c));
    for (const tx of transactions) void t.objectStore('transactions').put(tx);
    await t.done;
  },
  revert: async (db) => {
    const t = db.transaction(['transactions', 'categories'], 'readwrite');
    for (const tx of transactions) void t.objectStore('transactions').delete(tx.id);
    for (const c of newCategories) void t.objectStore('categories').delete(c.id);
    await t.done;
  },
});

export const composite = (label: string, commands: Command[]): Command => ({
  label,
  entities: [...new Set(commands.flatMap((c) => c.entities ?? []))],
  apply: async (db) => {
    for (const c of commands) await c.apply(db);
  },
  revert: async (db) => {
    for (const c of [...commands].reverse()) await c.revert(db);
  },
});

/** Brings an entry back from Trash. */
export const restoreFromTrash = (item: TrashItem): Command => ({
  label: tl('Restored {0}', item.tx.merchant),
  entities: [`tx:${item.id}`],
  apply: async (db) => {
    const t = db.transaction(['transactions', 'trash'], 'readwrite');
    void t.objectStore('transactions').put(item.tx);
    void t.objectStore('trash').delete(item.id);
    await t.done;
  },
  revert: async (db) => {
    const t = db.transaction(['transactions', 'trash'], 'readwrite');
    void t.objectStore('transactions').delete(item.id);
    void t.objectStore('trash').put(item);
    await t.done;
  },
});

/** Removes an entry from Trash for good. Undo still works during this session. */
export const deleteForever = (item: TrashItem, receipt?: Blob): Command => ({
  label: tl('Deleted {0} for good', item.tx.merchant),
  entities: [`tx:${item.id}`],
  apply: async (db) => {
    const t = db.transaction(['trash', 'receipts'], 'readwrite');
    void t.objectStore('trash').delete(item.id);
    void t.objectStore('receipts').delete(item.id);
    await t.done;
  },
  revert: async (db) => {
    const t = db.transaction(['trash', 'receipts'], 'readwrite');
    void t.objectStore('trash').put(item);
    if (receipt) void t.objectStore('receipts').put(receipt, item.id);
    await t.done;
  },
});

/** Stores (or removes, when `next` is null) the receipt for an entry, keyed by the entry id. */
export const setReceipt = (txId: string, next: Blob | null, previous?: Blob): Command => ({
  label: next ? tl('Attached a receipt') : tl('Removed a receipt'),
  entities: [`tx:${txId}`],
  apply: async (db) => {
    if (next) await db.put('receipts', next, txId);
    else await db.delete('receipts', txId);
  },
  revert: async (db) => {
    if (previous) await db.put('receipts', previous, txId);
    else await db.delete('receipts', txId);
  },
});

export const deleteRule = (rule: MerchantRule): Command => ({
  label: tl('Forgot {0}', rule.key),
  apply: async (db) => {
    await db.delete('rules', rule.key);
  },
  revert: async (db) => {
    await db.put('rules', rule);
  },
});

export const VIEWS_KEY = 'savedViews';

/** Saved views live in the settings store as one list. */
export const setViews = (next: SavedView[], previous: SavedView[], label: string): Command => ({
  label,
  apply: async (db) => {
    await db.put('settings', next, VIEWS_KEY);
  },
  revert: async (db) => {
    await db.put('settings', previous, VIEWS_KEY);
  },
});

/** Replaces one month's budgets (overall and per category) as a single undoable step. */
export const setMonthBudgets = (previous: Budget[], next: Budget[], label: string): Command => ({
  label,
  apply: async (db) => {
    const t = db.transaction('budgets', 'readwrite');
    for (const b of previous) void t.store.delete(b.id);
    for (const b of next) void t.store.put(b);
    await t.done;
  },
  revert: async (db) => {
    const t = db.transaction('budgets', 'readwrite');
    for (const b of next) void t.store.delete(b.id);
    for (const b of previous) void t.store.put(b);
    await t.done;
  },
});

/** Writes changed category rows (add, rename, recolour, reorder). `before` holds the old versions. */
export const putCategories = (before: Category[], after: Category[], label: string): Command => ({
  label,
  apply: async (db) => {
    const t = db.transaction('categories', 'readwrite');
    for (const c of after) void t.store.put(storedCategory(c));
    await t.done;
  },
  revert: async (db) => {
    const t = db.transaction('categories', 'readwrite');
    const old = new Set(before.map((c) => c.id));
    for (const c of after) if (!old.has(c.id)) void t.store.delete(c.id);
    for (const c of before) void t.store.put(storedCategory(c));
    await t.done;
  },
});

export const removeCategoryRow = (category: Category): Command => ({
  label: tl('Deleted {0}', category.name),
  apply: async (db) => {
    await db.delete('categories', category.id);
  },
  revert: async (db) => {
    await db.put('categories', storedCategory(category));
  },
});

export const putTrashItem = (before: TrashItem, after: TrashItem): Command => ({
  label: tl('Updated trash'),
  apply: async (db) => {
    await db.put('trash', after);
  },
  revert: async (db) => {
    await db.put('trash', before);
  },
});

/** Adds or changes a recurring payment. */
export const putRecurring = (
  next: RecurringItem,
  previous: RecurringItem | undefined,
  label: string,
): Command => ({
  label,
  apply: async (db) => {
    await db.put('recurring', next);
  },
  revert: async (db) => {
    if (previous) await db.put('recurring', previous);
    else await db.delete('recurring', next.id);
  },
});

export const removeRecurring = (item: RecurringItem): Command => ({
  label: tl('Removed {0} from recurring', item.merchant),
  apply: async (db) => {
    await db.delete('recurring', item.id);
  },
  revert: async (db) => {
    await db.put('recurring', item);
  },
});

/** The Drop 9, 10 and 12 stores, each a plain list of rows with an id. */
export type RowStore =
  | 'accounts'
  | 'flows'
  | 'people'
  | 'udhaar'
  | 'loans'
  | 'goals'
  | 'wishlist'
  | 'assets'
  | 'projects';
type RowOf<S extends RowStore> = LedgerDB[S]['value'];
export const ROW_STORES: readonly RowStore[] = [
  'accounts',
  'flows',
  'people',
  'udhaar',
  'loans',
  'goals',
  'wishlist',
  'assets',
  'projects',
];

/**
 * Adds or replaces one row; undo puts back the previous version (or removes a new row). A new row goes
 * to the space on screen unless `keepSpace` (rows from a backup already say where they belong).
 */
export const putRow = <S extends RowStore>(
  store: S,
  input: RowOf<S>,
  previous: RowOf<S> | undefined,
  label: string,
  keepSpace = false,
): Command => {
  const next = previous || keepSpace ? input : stampSpace(input);
  return {
    label,
    apply: async (db) => {
      await db.put(store, next);
    },
    revert: async (db) => {
      if (previous) await db.put(store, previous);
      else await db.delete(store, next.id);
    },
  };
};

export const removeRow = <S extends RowStore>(store: S, row: RowOf<S>, label: string): Command => ({
  label,
  apply: async (db) => {
    await db.delete(store, row.id);
  },
  revert: async (db) => {
    await db.put(store, row);
  },
});

export const FAVOURITES_KEY = 'favourites';
export const NO_SPEND_KEY = 'noSpendDays';
/** Split entries already settled with "Mark all settled" (Drop 11). */
export const SETTLED_SPLITS_KEY = 'settledSplits';
/** Months ('YYYY-MM') closed with "Close the month". */
export const CLOSED_MONTHS_KEY = 'closedMonths';
/** Your own rules, in order (Drop 12). */
export const CUSTOM_RULES_KEY = 'customRules';
/** Reports kept under a name (Drop 12). */
export const SAVED_REPORTS_KEY = 'savedReports';
/** Nudges put away with "Fine" (Drop 12); not part of backups. */
export const NUDGES_DISMISSED_KEY = 'nudgesDismissed';

/** Replaces one list kept in the settings store (favourites, no-spend days) as an undoable step. */
export const setSettingsList = <T>(
  key: string,
  next: T[],
  previous: T[],
  label: string,
): Command => ({
  label,
  apply: async (db) => {
    await db.put('settings', next, key);
  },
  revert: async (db) => {
    await db.put('settings', previous, key);
  },
});

export const IGNORED_RECURRING_KEY = 'recurringIgnored';

/** Merchants the user said are not recurring, so detection stops suggesting them. */
export const setIgnoredRecurring = (
  next: string[],
  previous: string[],
  label: string,
): Command => ({
  label,
  apply: async (db) => {
    await db.put('settings', next, IGNORED_RECURRING_KEY);
  },
  revert: async (db) => {
    await db.put('settings', previous, IGNORED_RECURRING_KEY);
  },
});

/** Everything a full restore replaces. Device settings (theme, privacy, PIN) are not part of it. */
export interface LedgerSnapshot {
  transactions: Transaction[];
  categories: Category[];
  rules: MerchantRule[];
  budgets: Budget[];
  recurring: RecurringItem[];
  accounts: Account[];
  flows: Flow[];
  people: Person[];
  udhaar: UdhaarEntry[];
  loans: Loan[];
  goals: Goal[];
  wishlist: WishItem[];
  assets: Asset[];
  projects: Project[];
}

const SNAPSHOT_STORES = [
  'transactions',
  'categories',
  'rules',
  'budgets',
  'recurring',
  'accounts',
  'flows',
  'people',
  'udhaar',
  'loans',
  'goals',
  'wishlist',
  'assets',
  'projects',
] as const;

async function writeSnapshot(db: Db, s: LedgerSnapshot): Promise<void> {
  const t = db.transaction([...SNAPSHOT_STORES], 'readwrite');
  await Promise.all(SNAPSHOT_STORES.map((name) => t.objectStore(name).clear()));
  for (const x of s.transactions) void t.objectStore('transactions').put(x);
  for (const x of s.categories) void t.objectStore('categories').put(storedCategory(x));
  for (const x of s.rules) void t.objectStore('rules').put(x);
  for (const x of s.budgets) void t.objectStore('budgets').put(x);
  for (const x of s.recurring) void t.objectStore('recurring').put(x);
  for (const x of s.accounts) void t.objectStore('accounts').put(x);
  for (const x of s.flows) void t.objectStore('flows').put(x);
  for (const x of s.people) void t.objectStore('people').put(x);
  for (const x of s.udhaar) void t.objectStore('udhaar').put(x);
  for (const x of s.loans) void t.objectStore('loans').put(x);
  for (const x of s.goals) void t.objectStore('goals').put(x);
  for (const x of s.wishlist) void t.objectStore('wishlist').put(x);
  for (const x of s.assets) void t.objectStore('assets').put(x);
  for (const x of s.projects) void t.objectStore('projects').put(x);
  await t.done;
}

/** Makes this device match a backup exactly; undo puts back what was here before. */
export const replaceEverything = (before: LedgerSnapshot, after: LedgerSnapshot): Command => ({
  label: tl('Restored a backup ({0} entries)', after.transactions.length),
  apply: (db) => writeSnapshot(db, after),
  revert: (db) => writeSnapshot(db, before),
});

/** Adds or changes a note or stamp. */
export const putNote = (next: Note, previous: Note | undefined, label: string): Command => ({
  label,
  apply: async (db) => {
    await db.put('notes', next);
  },
  revert: async (db) => {
    if (previous) await db.put('notes', previous);
    else await db.delete('notes', next.id);
  },
});

export const removeNote = (note: Note): Command => ({
  label: note.text ? tl('Deleted a note') : tl('Removed a stamp'),
  apply: async (db) => {
    await db.delete('notes', note.id);
  },
  revert: async (db) => {
    await db.put('notes', note);
  },
});

/** Labels of sketch steps start with this, so undoing them does not pop a toast for every stroke. */
export const SKETCH_LABEL = 'Sketch: ';

/** Replaces one page's drawing for one month (a stroke added, strokes erased, or cleared). */
export const putSketch = (next: Sketch, previous: Sketch | undefined, label: string): Command => ({
  label: `${SKETCH_LABEL}${label}`,
  apply: async (db) => {
    if (next.strokes.length === 0) await db.delete('sketches', next.id);
    else await db.put('sketches', next);
  },
  revert: async (db) => {
    if (previous && previous.strokes.length > 0) await db.put('sketches', previous);
    else await db.delete('sketches', next.id);
  },
});

export const SAMPLE_KEY = 'sampleData';

/** What loading the sample added, so removing it touches nothing else. */
export interface SampleMarker {
  transactionIds: string[];
  recurringIds: string[];
  budgets: Budget[];
  /** Ids of the sample's other rows, by store (Drop 13; missing in older markers). */
  rows?: Partial<Record<RowStore, string[]>>;
}

type SampleRowLists = Partial<{ [S in RowStore]: RowOf<S>[] }>;
const SAMPLE_STORES = ['transactions', 'recurring', 'budgets', 'settings', ...ROW_STORES] as const;

/** Adds the sample (entries, recurring payments, budgets for empty months) as one undoable step. */
export const loadSample = (
  data: {
    transactions: Transaction[];
    recurring: RecurringItem[];
    budgets: Budget[];
    rows?: SampleRowLists;
  },
  previousMarker: SampleMarker | undefined,
): Command => ({
  label: tl('Loaded sample data'),
  apply: async (db) => {
    const t = db.transaction([...SAMPLE_STORES], 'readwrite');
    for (const x of data.transactions) void t.objectStore('transactions').put(x);
    for (const x of data.recurring) void t.objectStore('recurring').put(x);
    for (const x of data.budgets) void t.objectStore('budgets').put(x);
    const rows: Partial<Record<RowStore, string[]>> = {};
    for (const store of ROW_STORES) {
      const list = (data.rows?.[store] ?? []) as Array<{ id: string }>;
      for (const x of list) void t.objectStore(store).put(x as never);
      if (list.length) rows[store] = list.map((x) => x.id);
    }
    const marker: SampleMarker = {
      transactionIds: data.transactions.map((x) => x.id),
      recurringIds: data.recurring.map((x) => x.id),
      budgets: data.budgets,
      rows,
    };
    void t.objectStore('settings').put(marker, SAMPLE_KEY);
    await t.done;
  },
  revert: async (db) => {
    const t = db.transaction([...SAMPLE_STORES], 'readwrite');
    for (const x of data.transactions) void t.objectStore('transactions').delete(x.id);
    for (const x of data.recurring) void t.objectStore('recurring').delete(x.id);
    for (const x of data.budgets) void t.objectStore('budgets').delete(x.id);
    for (const store of ROW_STORES)
      for (const x of (data.rows?.[store] ?? []) as Array<{ id: string }>)
        void t.objectStore(store).delete(x.id);
    if (previousMarker) void t.objectStore('settings').put(previousMarker, SAMPLE_KEY);
    else void t.objectStore('settings').delete(SAMPLE_KEY);
    await t.done;
  },
});

/**
 * Removes the sample for good (not to Trash): its entries, recurring payments and any budgets that
 * still have their sample amounts. Undo brings them back.
 */
export const removeSample = (
  marker: SampleMarker,
  removed: {
    transactions: Transaction[];
    recurring: RecurringItem[];
    budgets: Budget[];
    rows?: SampleRowLists;
  },
): Command => ({
  label: tl('Removed sample data'),
  apply: async (db) => {
    const t = db.transaction([...SAMPLE_STORES], 'readwrite');
    for (const x of removed.transactions) void t.objectStore('transactions').delete(x.id);
    for (const x of removed.recurring) void t.objectStore('recurring').delete(x.id);
    for (const x of removed.budgets) void t.objectStore('budgets').delete(x.id);
    for (const store of ROW_STORES)
      for (const x of (removed.rows?.[store] ?? []) as Array<{ id: string }>)
        void t.objectStore(store).delete(x.id);
    void t.objectStore('settings').delete(SAMPLE_KEY);
    await t.done;
  },
  revert: async (db) => {
    const t = db.transaction([...SAMPLE_STORES], 'readwrite');
    for (const x of removed.transactions) void t.objectStore('transactions').put(x);
    for (const x of removed.recurring) void t.objectStore('recurring').put(x);
    for (const x of removed.budgets) void t.objectStore('budgets').put(x);
    for (const store of ROW_STORES)
      for (const x of (removed.rows?.[store] ?? []) as Array<{ id: string }>)
        void t.objectStore(store).put(x as never);
    void t.objectStore('settings').put(marker, SAMPLE_KEY);
    await t.done;
  },
});
