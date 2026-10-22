import { create } from 'zustand';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { categorise, normalizeMerchantKey } from '../domain/categoriser';
import type { SavedView } from '../domain/filters';
import { budgetsForMonth, toBudgetRows, type MonthBudgets } from '../domain/budgets';
import { addDays, monthLabel, setMonthStartDay } from '../domain/dates';
import { MAX_FAVOURITES, repeatKey, type Favourite, type RepeatItem } from '../domain/repeat';
import {
  accountForMethod,
  balances,
  cashCheck,
  type Account,
  type AccountKind,
  type Flow,
  type IncomeKind,
} from '../domain/accounts';
import {
  findPerson,
  owedEffect,
  type Person,
  type UdhaarEntry,
  type UdhaarKind,
} from '../domain/udhaar';
import type { Loan } from '../domain/loans';
import { payFund, type Goal, type GoalKind } from '../domain/goals';
import type { WaitDays, WishItem } from '../domain/wishlist';
import type { Asset, AssetKind } from '../domain/networth';
import type { ForeignAmount } from '../domain/fx';
import { shouldLearn } from '../domain/learning';
import {
  myShare,
  shareAmounts,
  udhaarForSplit,
  type Split,
  type SplitMode,
} from '../domain/splits';
import { isDefaultCategory, makeCategory, OTHER_ID, recolor, reorder } from '../domain/categories';
import type { ImportPlan } from '../domain/csvImport';
import type { RecurringItem } from '../domain/recurring';
import type { AuditEvent } from '../domain/types';
import { cleanNote, type Note, type StampKind } from '../domain/notes';
import { fitCap, sketchId, type Sketch, type Stroke } from '../domain/sketch';
import { buildSample, isSampleId } from '../domain/sample';
import { todayISO } from '../domain/dates';
import { hashPin, resetDue, verifyPin } from '../domain/pin';
import { setPrivacy } from '../domain/money';
import type { ParsedEntry } from '../domain/parser';
import {
  DEFAULT_SETTINGS,
  type Budget,
  type BudgetKind,
  type Category,
  type CategoryId,
  type ISODate,
  type LockConfig,
  type PaymentMethod,
  type Settings,
  type Transaction,
  type TrashItem,
  type TxSource,
} from '../domain/types';
import { loadSettings, mergeDays, mergeFavourites, type BackupFile } from './backup';
import { CommandBus, purgeTrash } from './bus';
import {
  addTransaction,
  composite,
  deleteForever,
  deleteRule,
  deleteTransaction,
  importTransactions,
  restoreFromTrash,
  setMonthBudgets as setMonthBudgetsCommand,
  putCategories,
  removeCategoryRow,
  putTrashItem,
  putRecurring,
  removeRecurring,
  setIgnoredRecurring,
  IGNORED_RECURRING_KEY,
  replaceEverything,
  setReceipt,
  setRule,
  setViews,
  setSettingsList,
  FAVOURITES_KEY,
  NO_SPEND_KEY,
  CLOSED_MONTHS_KEY,
  SETTLED_SPLITS_KEY,
  putRow,
  removeRow,
  putNote,
  removeNote,
  putSketch,
  SKETCH_LABEL,
  loadSample as loadSampleCommand,
  removeSample as removeSampleCommand,
  SAMPLE_KEY,
  type SampleMarker,
  updateTransaction,
  VIEWS_KEY,
  type Command,
  type RowStore,
} from './commands';
import { DB_NAME, openLedgerDB, type Db, type LedgerDB } from './db';

type LedgerRow<S extends RowStore> = LedgerDB[S]['value'];

/** What the add and edit forms produce. */
export interface EntryDraft {
  date: ISODate;
  amountMinor: number;
  merchant: string;
  categoryId: CategoryId;
  method: PaymentMethod;
  notes: string;
  tags: string[];
  /** The account it came out of, when picked (otherwise its method's account). */
  accountId?: string;
  foreign?: ForeignAmount;
  /** Shared with people: amountMinor is then the whole bill, and the entry keeps your share. */
  split?: SplitDraft | null;
}

/** A person in a split: someone known (personId), a new name, or you (personId null, no name). */
export interface SplitPerson {
  personId?: string | null;
  personName?: string;
}

export interface SplitDraft {
  mode: SplitMode;
  /** null: you paid. */
  paidBy: SplitPerson | null;
  parts: Array<SplitPerson & { value: number }>;
}

/** What the money-in form produces. */
export interface IncomeDraft {
  date: ISODate;
  amountMinor: number;
  label: string;
  incomeKind: IncomeKind;
  accountId?: string;
  raw?: string;
}

export interface AccountDraft {
  name: string;
  kind: AccountKind;
  openingMinor: number;
  openingDate: ISODate;
  methods: PaymentMethod[];
  statementDay?: number;
  dueDay?: number;
  limitMinor?: number;
}

export interface UdhaarDraft {
  /** An existing person, or a name (a new person is added when nobody has it). */
  personId?: string;
  personName?: string;
  kind: UdhaarKind;
  date: ISODate;
  amountMinor: number;
  note: string;
  accountId?: string;
}

export type LoanDraft = Omit<Loan, 'id' | 'createdAt' | 'updatedAt'>;

export interface GoalDraft {
  name: string;
  kind: GoalKind;
  targetMinor: number;
  startDate: ISODate;
  dueDate: ISODate;
  yearly?: boolean;
}

export interface WishDraft {
  name: string;
  priceMinor: number;
  waitDays: WaitDays;
  note: string;
  categoryId?: CategoryId;
}

export interface AssetDraft {
  name: string;
  kind: AssetKind;
  /** The value now (only used when adding). */
  valueMinor: number;
  date: ISODate;
}

/** `undefined` leaves the receipt as it is, `null` removes it, a Blob replaces it. */
export type ReceiptChange = Blob | null | undefined;

export const LOCK_KEY = 'lock';
/** When "Forgot PIN?" was pressed (epoch ms). Cleared by the right PIN, a new PIN or the reset itself. */
export const LOCK_RESET_KEY = 'lockReset';

export interface LedgerState {
  ready: boolean;
  error: string | null;
  transactions: Transaction[];
  categories: Category[];
  rules: Record<string, CategoryId>;
  trash: TrashItem[];
  /** Every month's budgets. Read them with budgetsForMonth(). */
  budgets: Budget[];
  recurring: RecurringItem[];
  /** Merchant keys the user said are not recurring. */
  recurringIgnored: string[];
  views: SavedView[];
  /** Notes and stamps attached to things on the pages. */
  notes: Note[];
  /** Saved drawings, one per page and month. */
  sketches: Sketch[];
  /** What the sample data added, while it is loaded; null otherwise. */
  sample: SampleMarker | null;
  /** Entries pinned for one-tap repeating, in the user's order. */
  favourites: Favourite[];
  /** Days the user marked as having no spending, so they count as logged. */
  noSpendDays: ISODate[];
  /** Drop 9: accounts, money in / transfers / fees, people and udhaar, loans. */
  accounts: Account[];
  flows: Flow[];
  people: Person[];
  udhaar: UdhaarEntry[];
  loans: Loan[];
  /** Drop 10. */
  goals: Goal[];
  wishlist: WishItem[];
  assets: Asset[];
  closedMonths: string[];
  /** Split entries settled with "Mark all settled". */
  settledSplits: string[];
  settings: Settings;
  lock: LockConfig | null;
  /** True while the PIN screen is up. */
  locked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** Undoable steps, newest first (up to 20). */
  history: string[];
  notice: string | null;
  init: () => Promise<void>;
  getDb: () => Db;
  run: (command: Command, notice?: string) => Promise<void>;
  addFromParsed: (
    parsed: ParsedEntry,
    categoryId?: CategoryId,
    extra?: { date?: ISODate; method?: PaymentMethod },
  ) => Promise<void>;
  addEntry: (draft: EntryDraft, receipt?: Blob | null, source?: TxSource) => Promise<void>;
  /** Adds a repeat chip's entry (a favourite or a frequent one), for today unless a date is given. */
  addRepeat: (item: RepeatItem, date?: ISODate) => Promise<void>;
  /** Adds several parsed lines as one undoable step. Lines that are not ok are skipped. */
  addMany: (entries: ParsedEntry[]) => Promise<number>;
  /** Copies entries to today (new ids, no receipt), as one undoable step. */
  copyToToday: (ids: string[]) => Promise<void>;
  saveFavourite: (item: Omit<RepeatItem, 'key'>) => Promise<boolean>;
  removeFavourite: (id: string) => Promise<void>;
  moveFavourite: (id: string, toIndex: number) => Promise<void>;
  /** Marks days as having no spending (undoable). */
  markNoSpend: (dates: ISODate[]) => Promise<void>;
  saveAccount: (draft: AccountDraft, id?: string) => Promise<string>;
  /** Archives an account (kept in balances, hidden from pickers) or brings it back. */
  setAccountArchived: (id: string, archived: boolean) => Promise<void>;
  /** Deletes an account nothing refers to. Returns false (and archives nothing) when something does. */
  deleteAccount: (id: string) => Promise<boolean>;
  addIncome: (draft: IncomeDraft) => Promise<void>;
  /** Quick add's money in: the account follows the method, like spending does. */
  addIncomeFromParsed: (
    parsed: ParsedEntry,
    extra?: { date?: ISODate; method?: PaymentMethod; incomeKind?: IncomeKind },
  ) => Promise<void>;
  addTransfer: (input: {
    fromId: string;
    toId: string;
    amountMinor: number;
    date: ISODate;
    label?: string;
  }) => Promise<void>;
  addFee: (input: {
    accountId: string;
    amountMinor: number;
    date: ISODate;
    label: string;
  }) => Promise<void>;
  deleteFlow: (id: string) => Promise<void>;
  /**
   * A cash count: records the difference as spending ("Cash not logged") or only corrects the balance.
   * Returns the difference found.
   */
  resolveCashCheck: (
    accountId: string,
    countedMinor: number,
    mode: 'spending' | 'adjust',
  ) => Promise<number>;
  saveUdhaar: (draft: UdhaarDraft) => Promise<void>;
  deleteUdhaar: (id: string) => Promise<void>;
  /** Removes a person and all their entries, as one undoable step. */
  deletePerson: (id: string) => Promise<void>;
  saveLoan: (draft: LoanDraft, id?: string) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;
  /** A category's budget type or rollover. */
  setCategoryPlan: (
    id: string,
    patch: { budgetKind?: BudgetKind; rollover?: boolean },
  ) => Promise<void>;
  /** Plan reset: removes every budget of a month in one undoable step. */
  clearMonthBudgets: (month: string) => Promise<void>;
  saveGoal: (draft: GoalDraft, id?: string) => Promise<string>;
  deleteGoal: (id: string) => Promise<void>;
  addToGoal: (id: string, amountMinor: number, date: ISODate) => Promise<void>;
  removeFromGoal: (id: string, contributionId: string) => Promise<void>;
  snoozeGoal: (id: string, month: string, snoozed: boolean) => Promise<void>;
  /** A fund marked paid; a yearly one starts again for next year. */
  payGoal: (id: string) => Promise<void>;
  saveWish: (draft: WishDraft, id?: string) => Promise<void>;
  /** Logs the expense (today, last used method) and marks it bought, as one step. */
  buyWish: (id: string) => Promise<void>;
  skipWish: (id: string) => Promise<void>;
  deleteWish: (id: string) => Promise<void>;
  saveAsset: (draft: AssetDraft, id?: string) => Promise<void>;
  setAssetValue: (id: string, valueMinor: number, date: ISODate) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  /** Marks a month reviewed; an optional note is pinned to the month, in the same step. */
  closeMonth: (month: string, note?: string) => Promise<void>;
  /** Review mode: confirms an unsure entry, or moves it to another category, learning by the two-of-three rule. */
  reviewEntry: (id: string, categoryId?: CategoryId) => Promise<void>;
  /** Records your part of every open split as settled, as udhaar settle-ups, in one step. */
  settleSplits: () => Promise<void>;
  /** What the activity log holds about one entry, newest first. */
  getEntryHistory: (id: string) => Promise<AuditEvent[]>;
  editTransaction: (id: string, draft: EntryDraft, receipt?: ReceiptChange) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;
  bulkSetCategory: (ids: string[], categoryId: CategoryId) => Promise<void>;
  bulkAddTag: (ids: string[], tag: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  purge: (id: string) => Promise<void>;
  getReceipt: (id: string) => Promise<Blob | undefined>;
  forgetRule: (key: string) => Promise<void>;
  saveView: (view: SavedView) => Promise<void>;
  deleteView: (id: string) => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  removePin: (pin: string) => Promise<boolean>;
  unlock: (pin: string) => Promise<boolean>;
  lockNow: () => void;
  /** Replaces a month's budgets in one undoable step. Zero amounts are removed. */
  setMonthBudgets: (month: string, next: MonthBudgets, label?: string) => Promise<void>;
  addCategory: (name: string) => Promise<string>;
  renameCategory: (id: string, name: string) => Promise<void>;
  recolorCategory: (id: string, color: string) => Promise<void>;
  moveCategory: (id: string, toIndex: number) => Promise<void>;
  /** Moves every entry, rule, trash item and budget to `moveTo`, then deletes the category. */
  deleteCategory: (id: string, moveTo: string) => Promise<void>;
  saveRecurring: (item: RecurringItem, label?: string) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  /** Moves a recurring payment's dates by whole days (dragging a pill on the timeline). */
  shiftRecurring: (id: string, days: number) => Promise<void>;
  ignoreRecurring: (key: string) => Promise<void>;
  /** Adds a planned CSV import as one undoable step. */
  importCsv: (plan: ImportPlan) => Promise<void>;
  /** Makes the device match a backup exactly, as one undoable step. */
  restoreBackup: (file: BackupFile) => Promise<void>;
  getActivity: () => Promise<AuditEvent[]>;
  /** Epoch ms when a forgotten-PIN reset was requested, or null. */
  lockReset: number | null;
  requestPinReset: () => Promise<void>;
  /** Removes the PIN if a requested reset has waited 24 hours. Returns true when it did. */
  applyPinResetIfDue: () => Promise<boolean>;
  /** Merges a Ledger backup: adds entries, categories and rules this device lacks. Undoable. */
  importFromBackup: (file: BackupFile) => Promise<number>;
  /** Adds a note (or a stamp, with empty text) or changes one when `id` is given. Undoable. */
  saveNote: (input: {
    id?: string;
    anchor: string;
    page: string;
    text: string;
    stamp?: StampKind;
  }) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  addStroke: (page: string, month: string, stroke: Stroke) => Promise<void>;
  eraseStrokes: (page: string, month: string, ids: string[]) => Promise<void>;
  clearSketch: (page: string, month: string) => Promise<void>;
  /** Adds about three months of sample spending, recurring payments and budgets. Undoable. */
  loadSampleData: () => Promise<void>;
  /** Removes exactly what the sample added (budgets you changed are kept). Undoable. */
  removeSampleData: () => Promise<void>;
  undo: () => Promise<void>;
  /** Undoes the newest `steps` changes in order. */
  undoMany: (steps: number) => Promise<void>;
  redo: () => Promise<void>;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  dismissNotice: () => void;
}

/** Theme and privacy are mirrored to localStorage so the page can paint correctly before React loads. */
export function applyBoot(
  settings: Pick<Settings, 'theme' | 'privacy'> &
    Partial<Pick<Settings, 'motion' | 'doodles' | 'sketchStyle'>>,
): void {
  setPrivacy(settings.privacy);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
    root.dataset.motion = settings.motion ?? 'full';
    root.dataset.doodles = settings.doodles === false ? 'off' : 'on';
    if (settings.sketchStyle) root.dataset.sketch = 'on';
    else delete root.dataset.sketch;
  }
  try {
    localStorage.setItem('ledger.boot', JSON.stringify(settings));
  } catch {
    /* storage blocked: the app still works, it just may flash on load */
  }
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function createLedgerStore(dbName: string = DB_NAME) {
  let db: Db | null = null;
  let bus: CommandBus | null = null;
  let starting: Promise<void> | null = null;

  return create<LedgerState>((set, get) => {
    const requireDb = (): Db => {
      if (!db) throw new Error('The ledger database is not open yet.');
      return db;
    };

    /** Favourites and no-spend days a backup adds (never removes), as commands. */
    const listMerges = (file: BackupFile): Command[] => {
      const out: Command[] = [];
      const favs = mergeFavourites(get().favourites, file.data.favourites ?? []);
      if (favs.length !== get().favourites.length)
        out.push(setSettingsList(FAVOURITES_KEY, favs, get().favourites, 'Restored favourites'));
      const days = mergeDays(get().noSpendDays, file.data.noSpendDays ?? []);
      if (days.length !== get().noSpendDays.length)
        out.push(setSettingsList(NO_SPEND_KEY, days, get().noSpendDays, 'Restored no-spend days'));
      const closed = mergeDays(get().closedMonths, file.data.closedMonths ?? []);
      if (closed.length !== get().closedMonths.length)
        out.push(
          setSettingsList(CLOSED_MONTHS_KEY, closed, get().closedMonths, 'Restored closed months'),
        );
      const settled = mergeDays(get().settledSplits, file.data.settledSplits ?? []);
      if (settled.length !== get().settledSplits.length)
        out.push(
          setSettingsList(
            SETTLED_SPLITS_KEY,
            settled,
            get().settledSplits,
            'Restored settled splits',
          ),
        );
      return out;
    };

    /** A split's person: an existing id, a name (found, or added in `steps`), or null for you. */
    const resolvePerson = (
      p: SplitPerson | null,
      made: Person[],
      steps: Command[],
      now: number,
    ): string | null => {
      if (!p) return null;
      if (p.personId) return p.personId;
      const name = p.personName?.trim().replace(/\s+/g, ' ');
      if (!name) return null;
      const found = findPerson([...get().people, ...made], name);
      if (found) return found.id;
      const person: Person = { id: newId(), name, createdAt: now };
      made.push(person);
      steps.push(putRow('people', person, undefined, `Added ${name}`));
      return person.id;
    };

    /** A split entry worked out: your share, the split record, and the people and udhaar it adds. */
    const planSplit = (
      draft: SplitDraft,
      totalMinor: number,
      base: { date: ISODate; merchant: string; method: PaymentMethod; accountId?: string },
      now: number,
    ): { shareMinor: number; split: Split; steps: Command[] } => {
      const steps: Command[] = [];
      const made: Person[] = [];
      const paidBy = resolvePerson(draft.paidBy, made, steps, now);
      const ids = draft.parts.map((p) => resolvePerson(p, made, steps, now));
      const result = shareAmounts(
        totalMinor,
        draft.mode,
        draft.parts.map((p, i) => ({ personId: ids[i] ?? null, value: p.value })),
      );
      if (!result.ok) throw new Error(result.error);
      const parts = draft.parts.map((p, i) => ({
        personId: ids[i] ?? null,
        value: p.value,
        shareMinor: result.shares[i]!,
      }));
      const accountId = base.accountId ?? accountForMethod(get().accounts, base.method)?.id;
      const entries: UdhaarEntry[] = udhaarForSplit({ paidBy, parts }).map((o) => ({
        id: newId(),
        personId: o.personId,
        kind: o.kind,
        date: base.date,
        amountMinor: o.amountMinor,
        note: `Split: ${base.merchant}`,
        accountId: o.kind === 'lent' ? accountId : undefined,
        createdAt: now,
        updatedAt: now,
      }));
      for (const e of entries) steps.push(putRow('udhaar', e, undefined, 'Split'));
      const split: Split = {
        totalMinor,
        mode: draft.mode,
        paidBy,
        parts,
        udhaarIds: entries.map((e) => e.id),
      };
      const shareMinor = myShare(split);
      if (shareMinor <= 0) throw new Error('Your share is zero; record lending in Udhaar instead');
      return { shareMinor, split, steps };
    };

    /** Removes the udhaar a split created (when its entry is deleted or its split changes). */
    const dropSplitRows = (tx: Transaction): Command[] =>
      (tx.split?.udhaarIds ?? [])
        .map((id) => get().udhaar.find((u) => u.id === id))
        .filter((u): u is UdhaarEntry => u !== undefined)
        .map((u) => removeRow('udhaar', u, 'Split'));

    /** Puts a split's udhaar back (when its entry comes back from Trash). */
    const restoreSplitRows = (tx: Transaction): Command[] => {
      if (!tx.split) return [];
      const now = Date.now();
      const accountId = tx.accountId ?? accountForMethod(get().accounts, tx.method)?.id;
      return udhaarForSplit(tx.split)
        .map((o, i): UdhaarEntry => ({
          id: tx.split!.udhaarIds[i] ?? newId(),
          personId: o.personId,
          kind: o.kind,
          date: tx.date,
          amountMinor: o.amountMinor,
          note: `Split: ${tx.merchant}`,
          accountId: o.kind === 'lent' ? accountId : undefined,
          createdAt: now,
          updatedAt: now,
        }))
        .filter(
          (e) =>
            get().people.some((p) => p.id === e.personId) &&
            !get().udhaar.some((u) => u.id === e.id),
        )
        .map((e) => putRow('udhaar', e, undefined, 'Split'));
    };

    /** The rule change a category decision teaches, by the two-of-three rule (Drop 11), if any. */
    const learnStep = (after: Transaction, now: number): Command | null => {
      const key = normalizeMerchantKey(after.merchant);
      if (!key) return null;
      const decided = [
        ...get().transactions.filter(
          (t) => t.id !== after.id && !t.unsure && normalizeMerchantKey(t.merchant) === key,
        ),
        after,
      ];
      const rule = get().rules[key];
      if (!shouldLearn({ categoryId: after.categoryId, rule, decided })) return null;
      return setRule(
        { key, categoryId: after.categoryId, updatedAt: now },
        rule ? { key, categoryId: rule, updatedAt: now } : undefined,
      );
    };

    /** Drop 9 rows a merged backup adds: accounts, money in and transfers, people, udhaar, loans. */
    const rowMerges = (file: BackupFile): Command[] => {
      const out: Command[] = [];
      const add = <S extends RowStore>(
        store: S,
        have: readonly { id: string }[],
        incoming: readonly LedgerRow<S>[] | undefined,
      ) => {
        const ids = new Set(have.map((x) => x.id));
        for (const row of incoming ?? [])
          if (!ids.has(row.id)) out.push(putRow(store, row, undefined, 'Imported'));
      };
      add('accounts', get().accounts, file.data.accounts);
      add('flows', get().flows, file.data.flows);
      add('people', get().people, file.data.people);
      add('udhaar', get().udhaar, file.data.udhaar);
      add('loans', get().loans, file.data.loans);
      add('goals', get().goals, file.data.goals);
      add('wishlist', get().wishlist, file.data.wishlist);
      add('assets', get().assets, file.data.assets);
      return out;
    };

    const refresh = async (): Promise<void> => {
      const d = requireDb();
      const [
        transactions,
        categories,
        rules,
        trash,
        views,
        budgets,
        recurring,
        ignored,
        notes,
        sketches,
        sample,
        favourites,
        noSpend,
        accounts,
        flows,
        people,
        udhaar,
        loans,
        goals,
        wishlist,
        assets,
        closedMonths,
        settledSplits,
      ] = await Promise.all([
        d.getAll('transactions'),
        d.getAll('categories'),
        d.getAll('rules'),
        d.getAll('trash'),
        d.get('settings', VIEWS_KEY),
        d.getAll('budgets'),
        d.getAll('recurring'),
        d.get('settings', IGNORED_RECURRING_KEY),
        d.getAll('notes'),
        d.getAll('sketches'),
        d.get('settings', SAMPLE_KEY),
        d.get('settings', FAVOURITES_KEY),
        d.get('settings', NO_SPEND_KEY),
        d.getAll('accounts'),
        d.getAll('flows'),
        d.getAll('people'),
        d.getAll('udhaar'),
        d.getAll('loans'),
        d.getAll('goals'),
        d.getAll('wishlist'),
        d.getAll('assets'),
        d.get('settings', CLOSED_MONTHS_KEY),
        d.get('settings', SETTLED_SPLITS_KEY),
      ]);
      goals.sort((a, b) => a.createdAt - b.createdAt);
      wishlist.sort((a, b) => b.createdAt - a.createdAt);
      assets.sort((a, b) => a.createdAt - b.createdAt);
      accounts.sort((a, b) => a.order - b.order);
      flows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
      people.sort((a, b) => a.name.localeCompare(b.name));
      udhaar.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
      loans.sort((a, b) => a.createdAt - b.createdAt);
      notes.sort((a, b) => a.createdAt - b.createdAt);
      recurring.sort((a, b) => a.merchant.localeCompare(b.merchant));
      trash.sort((a, b) => b.deletedAt - a.deletedAt);
      transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
      categories.sort((a, b) => a.order - b.order);
      set({
        transactions,
        categories,
        rules: Object.fromEntries(rules.map((r) => [r.key, r.categoryId])),
        trash,
        budgets,
        recurring,
        recurringIgnored: Array.isArray(ignored) ? (ignored as string[]) : [],
        views: Array.isArray(views) ? (views as SavedView[]) : [],
        notes,
        sketches,
        sample: (sample as SampleMarker | undefined) ?? null,
        favourites: Array.isArray(favourites) ? (favourites as Favourite[]) : [],
        noSpendDays: Array.isArray(noSpend) ? (noSpend as ISODate[]) : [],
        accounts,
        flows,
        people,
        udhaar,
        loans,
        goals,
        wishlist,
        assets,
        closedMonths: Array.isArray(closedMonths) ? (closedMonths as string[]) : [],
        settledSplits: Array.isArray(settledSplits) ? (settledSplits as string[]) : [],
        canUndo: bus?.canUndo ?? false,
        canRedo: bus?.canRedo ?? false,
        undoLabel: bus?.undoLabel ?? null,
        redoLabel: bus?.redoLabel ?? null,
        history: bus?.undoLabels ?? [],
      });
    };

    return {
      ready: false,
      error: null,
      transactions: [],
      categories: [],
      rules: {},
      trash: [],
      budgets: [],
      recurring: [],
      recurringIgnored: [],
      views: [],
      notes: [],
      sketches: [],
      sample: null,
      favourites: [],
      noSpendDays: [],
      accounts: [],
      flows: [],
      people: [],
      udhaar: [],
      loans: [],
      goals: [],
      wishlist: [],
      assets: [],
      closedMonths: [],
      settledSplits: [],
      settings: DEFAULT_SETTINGS,
      lock: null,
      locked: false,
      lockReset: null,
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      history: [],
      notice: null,

      init: () => {
        starting ??= (async () => {
          try {
            db = await openLedgerDB(dbName);
            bus = new CommandBus(db, refresh);
            if ((await db.count('categories')) === 0) {
              const t = db.transaction('categories', 'readwrite');
              for (const c of DEFAULT_CATEGORIES) void t.store.put(c);
              await t.done;
            }
            await purgeTrash(db);
            const settings = await loadSettings(db);
            setMonthStartDay(settings.monthStartDay);
            const lock = ((await db.get('settings', LOCK_KEY)) as LockConfig | undefined) ?? null;
            const reset = await db.get('settings', LOCK_RESET_KEY);
            applyBoot(settings);
            await refresh();
            set({
              settings,
              lock,
              locked: lock !== null,
              lockReset: typeof reset === 'number' ? reset : null,
              ready: true,
              error: null,
            });
            await get().applyPinResetIfDue();
          } catch (e) {
            set({ error: e instanceof Error ? e.message : 'Could not open local storage.' });
          }
        })();
        return starting;
      },

      getDb: requireDb,

      run: async (command, notice) => {
        if (!bus) throw new Error('The ledger is not ready yet.');
        await bus.run(command);
        set({ notice: notice ?? command.label });
      },

      addFromParsed: async (parsed, categoryId, extra = {}) => {
        if (!parsed.ok || parsed.amountMinor === null) return;
        const { settings, rules } = get();
        const now = Date.now();
        const chosen = categoryId ?? parsed.categoryId;
        const tx: Transaction = {
          id: newId(),
          date: extra.date ?? parsed.date,
          amountMinor: parsed.amountMinor,
          currency: settings.currency,
          merchant: parsed.merchant,
          categoryId: chosen,
          method: extra.method ?? parsed.method,
          notes: '',
          tags: [],
          raw: parsed.raw,
          source: 'quick',
          unsure: parsed.unsure && categoryId === undefined,
          createdAt: now,
          updatedAt: now,
        };
        const commands: Command[] = [addTransaction(tx)];
        const key = normalizeMerchantKey(parsed.merchant);
        if (key && categoryId !== undefined && categoryId !== parsed.categoryId) {
          const previous = rules[key];
          commands.push(
            setRule(
              { key, categoryId, updatedAt: now },
              previous ? { key, categoryId: previous, updatedAt: now } : undefined,
            ),
          );
        }
        await get().run(
          commands.length === 1 ? commands[0]! : composite(`Added ${tx.merchant}`, commands),
          `Added ${tx.merchant}`,
        );
        const method = extra.method ?? (parsed.methodTyped ? parsed.method : undefined);
        if (method && method !== settings.lastMethod) await get().setSetting('lastMethod', method);
      },

      addEntry: async (draft, receipt, source = 'form') => {
        const { settings, rules } = get();
        const now = Date.now();
        const { split: splitDraft, ...fields } = draft;
        const plan = splitDraft ? planSplit(splitDraft, draft.amountMinor, draft, now) : null;
        const tx: Transaction = {
          id: newId(),
          ...fields,
          amountMinor: plan ? plan.shareMinor : draft.amountMinor,
          ...(plan ? { split: plan.split } : {}),
          currency: settings.currency,
          source,
          unsure: false,
          hasReceipt: receipt ? true : undefined,
          createdAt: now,
          updatedAt: now,
        };
        const steps: Command[] = [addTransaction(tx), ...(plan?.steps ?? [])];
        if (receipt) steps.push(setReceipt(tx.id, receipt));
        const key = normalizeMerchantKey(draft.merchant);
        const guess = categorise(draft.merchant, rules);
        if (key && guess.confidence === 'none' && draft.categoryId !== guess.categoryId) {
          steps.push(setRule({ key, categoryId: draft.categoryId, updatedAt: now }));
        }
        const label = `Added ${tx.merchant}`;
        await get().run(steps.length === 1 ? steps[0]! : composite(label, steps), label);
        if (draft.method !== settings.lastMethod)
          await get().setSetting('lastMethod', draft.method);
      },

      editTransaction: async (id, draft, receipt) => {
        const before = get().transactions.find((t) => t.id === id);
        if (!before) return;
        const now = Date.now();
        const categoryChanged = draft.categoryId !== before.categoryId;
        const { split: splitDraft, ...fields } = draft;
        // undefined keeps the split as it is; null removes it; a draft works it out again.
        const plan = splitDraft ? planSplit(splitDraft, draft.amountMinor, draft, now) : null;
        const after: Transaction = {
          ...before,
          ...fields,
          ...(plan ? { amountMinor: plan.shareMinor, split: plan.split } : {}),
          ...(splitDraft === null ? { split: undefined } : {}),
          unsure: before.unsure && !categoryChanged ? true : false,
          hasReceipt: receipt === undefined ? before.hasReceipt : receipt !== null || undefined,
          updatedAt: now,
        };
        const steps: Command[] = [
          updateTransaction(before, after),
          ...(splitDraft !== undefined ? dropSplitRows(before) : []),
          ...(plan?.steps ?? []),
        ];
        if (receipt !== undefined) {
          const previous = before.hasReceipt ? await requireDb().get('receipts', id) : undefined;
          steps.push(setReceipt(id, receipt, previous));
        }
        if (categoryChanged) {
          const learn = learnStep(after, now);
          if (learn) steps.push(learn);
        }
        const label = `Edited ${after.merchant}`;
        await get().run(steps.length === 1 ? steps[0]! : composite(label, steps), label);
      },

      addRepeat: async (item, date) => {
        const now = Date.now();
        const tx: Transaction = {
          id: newId(),
          date: date ?? todayISO(),
          amountMinor: item.amountMinor,
          currency: get().settings.currency,
          merchant: item.merchant,
          categoryId: item.categoryId,
          method: item.method,
          notes: '',
          tags: [...item.tags],
          source: 'repeat',
          unsure: false,
          createdAt: now,
          updatedAt: now,
        };
        await get().run(addTransaction(tx), `Added ${tx.merchant}`);
      },

      addMany: async (entries) => {
        const { settings } = get();
        const ok = entries.filter((p) => p.ok && p.amountMinor !== null && p.amountMinor > 0);
        if (ok.length === 0) return 0;
        const now = Date.now();
        const steps = ok.map((p, i) =>
          addTransaction({
            id: newId(),
            date: p.date,
            amountMinor: p.amountMinor!,
            currency: settings.currency,
            merchant: p.merchant,
            categoryId: p.categoryId,
            method: p.method,
            notes: '',
            tags: [],
            raw: p.raw,
            source: 'quick',
            unsure: p.unsure,
            // Keeps the typed order within a day.
            createdAt: now + i,
            updatedAt: now + i,
          }),
        );
        const label = `Added ${ok.length} ${ok.length === 1 ? 'entry' : 'entries'}`;
        await get().run(steps.length === 1 ? steps[0]! : composite(label, steps), label);
        return ok.length;
      },

      copyToToday: async (ids) => {
        const list = get().transactions.filter((t) => ids.includes(t.id));
        if (list.length === 0) return;
        const today = todayISO();
        const now = Date.now();
        const steps = list.map((t, i) =>
          addTransaction({
            ...t,
            id: newId(),
            date: today,
            source: 'repeat',
            raw: undefined,
            hasReceipt: undefined,
            recurringId: undefined,
            split: undefined,
            unsure: false,
            createdAt: now + i,
            updatedAt: now + i,
          }),
        );
        const label = `Copied ${list.length} ${list.length === 1 ? 'entry' : 'entries'} to today`;
        await get().run(steps.length === 1 ? steps[0]! : composite(label, steps), label);
      },

      saveFavourite: async (item) => {
        const previous = get().favourites;
        const key = repeatKey(item);
        const existing = previous.find((f) => repeatKey(f) === key);
        if (existing) {
          set({ notice: `${existing.merchant} is already a favourite` });
          return false;
        }
        if (previous.length >= MAX_FAVOURITES) {
          set({ notice: `Up to ${MAX_FAVOURITES} favourites. Remove one in Settings first.` });
          return false;
        }
        const fav: Favourite = {
          id: newId(),
          merchant: item.merchant,
          amountMinor: item.amountMinor,
          categoryId: item.categoryId,
          method: item.method,
          tags: [...item.tags],
          createdAt: Date.now(),
        };
        await get().run(
          setSettingsList(
            FAVOURITES_KEY,
            [...previous, fav],
            previous,
            `Saved ${fav.merchant} as a favourite`,
          ),
        );
        return true;
      },

      removeFavourite: async (id) => {
        const previous = get().favourites;
        const fav = previous.find((f) => f.id === id);
        if (!fav) return;
        await get().run(
          setSettingsList(
            FAVOURITES_KEY,
            previous.filter((f) => f.id !== id),
            previous,
            `Removed ${fav.merchant} from favourites`,
          ),
        );
      },

      moveFavourite: async (id, toIndex) => {
        const previous = get().favourites;
        const from = previous.findIndex((f) => f.id === id);
        const to = Math.max(0, Math.min(previous.length - 1, toIndex));
        if (from < 0 || from === to) return;
        const next = [...previous];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        await get().run(setSettingsList(FAVOURITES_KEY, next, previous, 'Reordered favourites'));
      },

      markNoSpend: async (dates) => {
        const previous = get().noSpendDays;
        const add = [...new Set(dates)].filter((d) => !previous.includes(d));
        if (add.length === 0) return;
        const next = [...previous, ...add].sort();
        const label =
          add.length === 1
            ? 'Marked a day with no spending'
            : `Marked ${add.length} days with no spending`;
        await get().run(setSettingsList(NO_SPEND_KEY, next, previous, label));
      },

      saveAccount: async (draft, id) => {
        const now = Date.now();
        const previous = id ? get().accounts.find((a) => a.id === id) : undefined;
        const next: Account = previous
          ? { ...previous, ...draft, name: draft.name.trim(), updatedAt: now }
          : {
              id: newId(),
              ...draft,
              name: draft.name.trim(),
              order: get().accounts.length,
              createdAt: now,
              updatedAt: now,
            };
        // A payment method belongs to one account: picking it here takes it from the others.
        const steps: Command[] = [];
        for (const other of get().accounts) {
          if (other.id === next.id) continue;
          const kept = other.methods.filter((m) => !next.methods.includes(m));
          if (kept.length !== other.methods.length)
            steps.push(
              putRow(
                'accounts',
                { ...other, methods: kept, updatedAt: now },
                other,
                'Moved methods',
              ),
            );
        }
        const label = previous ? `Updated ${next.name}` : `Added ${next.name}`;
        steps.unshift(putRow('accounts', next, previous, label));
        await get().run(steps.length === 1 ? steps[0]! : composite(label, steps), label);
        return next.id;
      },

      setAccountArchived: async (id, archived) => {
        const a = get().accounts.find((x) => x.id === id);
        if (!a || Boolean(a.archived) === archived) return;
        const label = archived ? `Archived ${a.name}` : `Brought back ${a.name}`;
        await get().run(
          putRow(
            'accounts',
            { ...a, archived: archived || undefined, updatedAt: Date.now() },
            a,
            label,
          ),
        );
      },

      deleteAccount: async (id) => {
        const { accounts, flows, udhaar, transactions } = get();
        const a = accounts.find((x) => x.id === id);
        if (!a) return false;
        const used =
          flows.some((f) => f.accountId === id || f.toAccountId === id) ||
          udhaar.some((u) => u.accountId === id) ||
          transactions.some((t) => t.accountId === id);
        if (used) return false;
        await get().run(removeRow('accounts', a, `Deleted ${a.name}`));
        return true;
      },

      addIncome: async (draft) => {
        const now = Date.now();
        const flow: Flow = {
          id: newId(),
          kind: 'income',
          date: draft.date,
          amountMinor: draft.amountMinor,
          label: draft.label.trim() || 'Money in',
          incomeKind: draft.incomeKind,
          accountId: draft.accountId,
          raw: draft.raw,
          createdAt: now,
          updatedAt: now,
        };
        await get().run(
          putRow('flows', flow, undefined, `Added ${flow.label}`),
          `Money in: ${flow.label}`,
        );
      },

      addIncomeFromParsed: async (parsed, extra = {}) => {
        if (!parsed.ok || parsed.amountMinor === null) return;
        const method = extra.method ?? parsed.method;
        await get().addIncome({
          date: extra.date ?? parsed.date,
          amountMinor: parsed.amountMinor,
          label: parsed.merchant,
          incomeKind: extra.incomeKind ?? parsed.incomeKind,
          accountId: accountForMethod(get().accounts, method)?.id,
          raw: parsed.raw,
        });
      },

      addTransfer: async ({ fromId, toId, amountMinor, date, label }) => {
        const { accounts } = get();
        const from = accounts.find((a) => a.id === fromId);
        const to = accounts.find((a) => a.id === toId);
        if (!from || !to || fromId === toId || amountMinor <= 0) return;
        const now = Date.now();
        const text =
          label?.trim() || (to.kind === 'card' ? `Paid ${to.name}` : `${from.name} to ${to.name}`);
        const flow: Flow = {
          id: newId(),
          kind: 'transfer',
          date,
          amountMinor,
          label: text,
          accountId: fromId,
          toAccountId: toId,
          createdAt: now,
          updatedAt: now,
        };
        await get().run(putRow('flows', flow, undefined, text));
      },

      addFee: async ({ accountId, amountMinor, date, label }) => {
        if (amountMinor <= 0) return;
        const now = Date.now();
        const flow: Flow = {
          id: newId(),
          kind: 'fee',
          date,
          amountMinor,
          label: label.trim() || 'Interest or fee',
          accountId,
          createdAt: now,
          updatedAt: now,
        };
        await get().run(putRow('flows', flow, undefined, `Added ${flow.label}`));
      },

      deleteFlow: async (id) => {
        const f = get().flows.find((x) => x.id === id);
        if (f) await get().run(removeRow('flows', f, `Deleted ${f.label}`));
      },

      resolveCashCheck: async (accountId, countedMinor, mode) => {
        const { accounts, transactions, flows, udhaar, settings } = get();
        const account = accounts.find((a) => a.id === accountId);
        if (!account) return 0;
        const today = todayISO();
        const expected = balances(accounts, { transactions, flows, udhaar }, today)[accountId] ?? 0;
        const { differenceMinor } = cashCheck(expected, countedMinor);
        if (differenceMinor === 0) {
          set({ notice: `${account.name} matches. Nothing to change.` });
          return 0;
        }
        const now = Date.now();
        if (mode === 'spending' && differenceMinor < 0) {
          const tx: Transaction = {
            id: newId(),
            date: today,
            amountMinor: -differenceMinor,
            currency: settings.currency,
            merchant: 'Cash not logged',
            categoryId: OTHER_ID,
            method: 'Cash',
            accountId,
            notes: 'From a cash check',
            tags: [],
            source: 'form',
            unsure: false,
            createdAt: now,
            updatedAt: now,
          };
          await get().run(addTransaction(tx), 'Recorded the difference as spending');
        } else {
          const flow: Flow = {
            id: newId(),
            kind: 'adjust',
            date: today,
            amountMinor: differenceMinor,
            label: 'Cash check',
            accountId,
            createdAt: now,
            updatedAt: now,
          };
          await get().run(putRow('flows', flow, undefined, `Corrected ${account.name}`));
        }
        return differenceMinor;
      },

      saveUdhaar: async (draft) => {
        if (draft.amountMinor <= 0) return;
        const now = Date.now();
        const steps: Command[] = [];
        let person = draft.personId ? get().people.find((p) => p.id === draft.personId) : undefined;
        if (!person && draft.personName?.trim()) {
          person = findPerson(get().people, draft.personName);
          if (!person) {
            person = {
              id: newId(),
              name: draft.personName.trim().replace(/\s+/g, ' '),
              createdAt: now,
            };
            steps.push(putRow('people', person, undefined, `Added ${person.name}`));
          }
        }
        if (!person) return;
        const entry: UdhaarEntry = {
          id: newId(),
          personId: person.id,
          kind: draft.kind,
          date: draft.date,
          amountMinor: draft.amountMinor,
          note: draft.note.trim(),
          accountId: draft.accountId,
          createdAt: now,
          updatedAt: now,
        };
        const words: Record<UdhaarKind, string> = {
          lent: `Lent to ${person.name}`,
          borrowed: `Borrowed from ${person.name}`,
          'got-back': `${person.name} paid back`,
          'paid-back': `Paid back ${person.name}`,
        };
        const label = words[draft.kind];
        steps.push(putRow('udhaar', entry, undefined, label));
        await get().run(steps.length === 1 ? steps[0]! : composite(label, steps), label);
      },

      deleteUdhaar: async (id) => {
        const e = get().udhaar.find((x) => x.id === id);
        if (e) await get().run(removeRow('udhaar', e, 'Deleted an udhaar entry'));
      },

      deletePerson: async (id) => {
        const person = get().people.find((p) => p.id === id);
        if (!person) return;
        const label = `Removed ${person.name}`;
        const steps: Command[] = [
          ...get()
            .udhaar.filter((e) => e.personId === id)
            .map((e) => removeRow('udhaar', e, label)),
          removeRow('people', person, label),
        ];
        await get().run(composite(label, steps), label);
      },

      saveLoan: async (draft, id) => {
        const now = Date.now();
        const previous = id ? get().loans.find((l) => l.id === id) : undefined;
        const next: Loan = previous
          ? { ...previous, ...draft, name: draft.name.trim(), updatedAt: now }
          : { id: newId(), ...draft, name: draft.name.trim(), createdAt: now, updatedAt: now };
        await get().run(
          putRow('loans', next, previous, previous ? `Updated ${next.name}` : `Added ${next.name}`),
        );
      },

      deleteLoan: async (id) => {
        const l = get().loans.find((x) => x.id === id);
        if (l) await get().run(removeRow('loans', l, `Deleted ${l.name}`));
      },

      setCategoryPlan: async (id, patch) => {
        const before = get().categories.find((c) => c.id === id);
        if (!before) return;
        const after: Category = { ...before, ...patch };
        if (after.budgetKind === before.budgetKind && !!after.rollover === !!before.rollover)
          return;
        const label =
          patch.rollover !== undefined
            ? `${patch.rollover ? 'Turned on' : 'Turned off'} rollover for ${before.name}`
            : `Made ${before.name} ${(patch.budgetKind ?? 'flexible').replace('-', ' ')}`;
        await get().run(putCategories([before], [after], label));
      },

      clearMonthBudgets: async (month) => {
        await get().setMonthBudgets(
          month,
          { overall: null, categories: {} },
          `Cleared the budgets for ${monthLabel(month)}`,
        );
      },

      saveGoal: async (draft, id) => {
        const now = Date.now();
        const previous = id ? get().goals.find((g) => g.id === id) : undefined;
        const clean = {
          ...draft,
          name: draft.name.trim(),
          yearly: draft.kind === 'fund' && draft.yearly ? true : undefined,
        };
        const next: Goal = previous
          ? { ...previous, ...clean, updatedAt: now }
          : {
              id: newId(),
              ...clean,
              contributions: [],
              snoozed: [],
              createdAt: now,
              updatedAt: now,
            };
        await get().run(
          putRow('goals', next, previous, previous ? `Updated ${next.name}` : `Added ${next.name}`),
        );
        return next.id;
      },

      deleteGoal: async (id) => {
        const g = get().goals.find((x) => x.id === id);
        if (g) await get().run(removeRow('goals', g, `Deleted ${g.name}`));
      },

      addToGoal: async (id, amountMinor, date) => {
        const g = get().goals.find((x) => x.id === id);
        if (!g || amountMinor <= 0) return;
        const next: Goal = {
          ...g,
          contributions: [...g.contributions, { id: newId(), date, amountMinor }],
          updatedAt: Date.now(),
        };
        await get().run(putRow('goals', next, g, `Put money aside for ${g.name}`));
      },

      removeFromGoal: async (id, contributionId) => {
        const g = get().goals.find((x) => x.id === id);
        if (!g || !g.contributions.some((c) => c.id === contributionId)) return;
        const next: Goal = {
          ...g,
          contributions: g.contributions.filter((c) => c.id !== contributionId),
          updatedAt: Date.now(),
        };
        await get().run(putRow('goals', next, g, `Took back an amount from ${g.name}`));
      },

      snoozeGoal: async (id, month, snoozed) => {
        const g = get().goals.find((x) => x.id === id);
        if (!g || g.snoozed.includes(month) === snoozed) return;
        const next: Goal = {
          ...g,
          snoozed: snoozed ? [...g.snoozed, month].sort() : g.snoozed.filter((m) => m !== month),
          updatedAt: Date.now(),
        };
        await get().run(
          putRow(
            'goals',
            next,
            g,
            `${snoozed ? 'Snoozed' : 'Unsnoozed'} ${g.name} for ${monthLabel(month)}`,
          ),
        );
      },

      payGoal: async (id) => {
        const g = get().goals.find((x) => x.id === id);
        if (!g || g.paidOn) return;
        const next = { ...payFund(g, todayISO(), newId()), updatedAt: Date.now() };
        await get().run(putRow('goals', next, g, `Paid ${g.name}`));
      },

      saveWish: async (draft, id) => {
        const now = Date.now();
        const previous = id ? get().wishlist.find((w) => w.id === id) : undefined;
        const clean = { ...draft, name: draft.name.trim(), note: draft.note.trim() };
        const next: WishItem = previous
          ? { ...previous, ...clean, updatedAt: now }
          : {
              id: newId(),
              ...clean,
              addedOn: todayISO(),
              status: 'waiting',
              createdAt: now,
              updatedAt: now,
            };
        await get().run(
          putRow(
            'wishlist',
            next,
            previous,
            previous ? `Updated ${next.name}` : `Added ${next.name} to the wishlist`,
          ),
        );
      },

      buyWish: async (id) => {
        const w = get().wishlist.find((x) => x.id === id);
        if (!w || w.status !== 'waiting') return;
        const { settings, rules } = get();
        const now = Date.now();
        const today = todayISO();
        const tx: Transaction = {
          id: newId(),
          date: today,
          amountMinor: w.priceMinor,
          currency: settings.currency,
          merchant: w.name,
          categoryId: w.categoryId ?? categorise(w.name, rules).categoryId,
          method: settings.lastMethod,
          notes: w.note,
          tags: [],
          source: 'wishlist',
          unsure: false,
          createdAt: now,
          updatedAt: now,
        };
        const label = `Bought ${w.name}`;
        await get().run(
          composite(label, [
            addTransaction(tx),
            putRow(
              'wishlist',
              { ...w, status: 'bought', decidedOn: today, txId: tx.id, updatedAt: now },
              w,
              label,
            ),
          ]),
          label,
        );
      },

      skipWish: async (id) => {
        const w = get().wishlist.find((x) => x.id === id);
        if (!w || w.status !== 'waiting') return;
        await get().run(
          putRow(
            'wishlist',
            { ...w, status: 'skipped', decidedOn: todayISO(), updatedAt: Date.now() },
            w,
            `Skipped ${w.name}`,
          ),
        );
      },

      deleteWish: async (id) => {
        const w = get().wishlist.find((x) => x.id === id);
        if (w) await get().run(removeRow('wishlist', w, `Removed ${w.name} from the wishlist`));
      },

      saveAsset: async (draft, id) => {
        const now = Date.now();
        const previous = id ? get().assets.find((a) => a.id === id) : undefined;
        const name = draft.name.trim();
        const next: Asset = previous
          ? { ...previous, name, kind: draft.kind, updatedAt: now }
          : {
              id: newId(),
              name,
              kind: draft.kind,
              values: [{ date: draft.date, valueMinor: draft.valueMinor }],
              createdAt: now,
              updatedAt: now,
            };
        await get().run(
          putRow('assets', next, previous, previous ? `Updated ${name}` : `Added ${name}`),
        );
      },

      setAssetValue: async (id, valueMinor, date) => {
        const a = get().assets.find((x) => x.id === id);
        if (!a || valueMinor < 0) return;
        const next: Asset = {
          ...a,
          values: [...a.values.filter((v) => v.date !== date), { date, valueMinor }].sort((x, y) =>
            x.date.localeCompare(y.date),
          ),
          updatedAt: Date.now(),
        };
        await get().run(putRow('assets', next, a, `Updated the value of ${a.name}`));
      },

      deleteAsset: async (id) => {
        const a = get().assets.find((x) => x.id === id);
        if (a) await get().run(removeRow('assets', a, `Deleted ${a.name}`));
      },

      closeMonth: async (month, note = '') => {
        const previous = get().closedMonths;
        if (previous.includes(month)) return;
        const label = `Closed ${monthLabel(month)}`;
        const close = setSettingsList(
          CLOSED_MONTHS_KEY,
          [...previous, month].sort(),
          previous,
          label,
        );
        const text = cleanNote(note);
        if (!text) {
          await get().run(close);
          return;
        }
        const now = Date.now();
        const pinned: Note = {
          id: newId(),
          anchor: `month:${month}`,
          page: '/',
          text,
          createdAt: now,
          updatedAt: now,
        };
        await get().run(composite(label, [close, putNote(pinned, undefined, label)]), label);
      },

      reviewEntry: async (id, categoryId) => {
        const before = get().transactions.find((t) => t.id === id);
        if (!before) return;
        const now = Date.now();
        const target = categoryId ?? before.categoryId;
        const after: Transaction = { ...before, categoryId: target, unsure: false, updatedAt: now };
        const steps: Command[] = [updateTransaction(before, after)];
        const learn = learnStep(after, now);
        if (learn) steps.push(learn);
        const name = get().categories.find((c) => c.id === target)?.name ?? 'Other';
        const label =
          target === before.categoryId
            ? `Confirmed ${before.merchant} as ${name}`
            : `Moved ${before.merchant} to ${name}`;
        await get().run(composite(label, steps), label);
      },

      settleSplits: async () => {
        const settled = get().settledSplits;
        const open = get().transactions.filter((t) => t.split && !settled.includes(t.id));
        if (open.length === 0) return;
        // Your part with each person: what the open splits' udhaar says they owe you, or you owe them.
        const ids = new Set(open.flatMap((t) => t.split!.udhaarIds));
        const perPerson = new Map<string, number>();
        for (const u of get().udhaar)
          if (ids.has(u.id))
            perPerson.set(u.personId, (perPerson.get(u.personId) ?? 0) + owedEffect(u));
        const now = Date.now();
        const today = todayISO();
        const label = 'Settled all splits';
        const steps: Command[] = [...perPerson]
          .filter(([, v]) => v !== 0)
          .map(([personId, v]) =>
            putRow(
              'udhaar',
              {
                id: newId(),
                personId,
                kind: v > 0 ? 'got-back' : 'paid-back',
                date: today,
                amountMinor: Math.abs(v),
                note: 'Settled splits',
                createdAt: now,
                updatedAt: now,
              },
              undefined,
              label,
            ),
          );
        steps.push(
          setSettingsList(
            SETTLED_SPLITS_KEY,
            [...settled, ...open.map((t) => t.id)].sort(),
            settled,
            label,
          ),
        );
        await get().run(composite(label, steps), label);
      },

      getEntryHistory: async (id) => {
        const events = await requireDb().getAll('audit');
        return events
          .filter((e) => e.entities?.includes(`tx:${id}`))
          .sort((a, b) => b.at - a.at || (b.id ?? 0) - (a.id ?? 0));
      },

      bulkDelete: async (ids) => {
        const list = get().transactions.filter((t) => ids.includes(t.id));
        if (list.length === 0) return;
        const label = `Deleted ${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;
        await get().run(
          composite(
            label,
            list.flatMap((t) => [deleteTransaction(t), ...dropSplitRows(t)]),
          ),
          label,
        );
      },

      bulkSetCategory: async (ids, categoryId) => {
        const now = Date.now();
        const list = get().transactions.filter(
          (t) => ids.includes(t.id) && t.categoryId !== categoryId,
        );
        if (list.length === 0) return;
        const name = get().categories.find((c) => c.id === categoryId)?.name ?? 'Other';
        const label = `Moved ${list.length} to ${name}`;
        await get().run(
          composite(
            label,
            list.map((t) =>
              updateTransaction(t, { ...t, categoryId, unsure: false, updatedAt: now }),
            ),
          ),
          label,
        );
      },

      bulkAddTag: async (ids, tag) => {
        const now = Date.now();
        const list = get().transactions.filter((t) => ids.includes(t.id) && !t.tags.includes(tag));
        if (!tag || list.length === 0) return;
        const label = `Tagged ${list.length} with ${tag}`;
        await get().run(
          composite(
            label,
            list.map((t) => updateTransaction(t, { ...t, tags: [...t.tags, tag], updatedAt: now })),
          ),
          label,
        );
      },

      restore: async (id) => {
        const item = get().trash.find((t) => t.id === id);
        if (!item) return;
        const extra = restoreSplitRows(item.tx);
        const restoring = restoreFromTrash(item);
        await get().run(
          extra.length === 0 ? restoring : composite(restoring.label, [restoring, ...extra]),
        );
      },

      purge: async (id) => {
        const item = get().trash.find((t) => t.id === id);
        if (!item) return;
        const receipt = await requireDb().get('receipts', id);
        await get().run(deleteForever(item, receipt));
      },

      getReceipt: (id) => requireDb().get('receipts', id),

      forgetRule: async (key) => {
        const categoryId = get().rules[key];
        if (categoryId) await get().run(deleteRule({ key, categoryId, updatedAt: Date.now() }));
      },

      saveView: async (view) => {
        const previous = get().views;
        const next = [...previous.filter((v) => v.id !== view.id), view];
        await get().run(setViews(next, previous, `Saved view ${view.name}`));
      },

      deleteView: async (id) => {
        const previous = get().views;
        const view = previous.find((v) => v.id === id);
        if (!view) return;
        await get().run(
          setViews(
            previous.filter((v) => v.id !== id),
            previous,
            `Deleted view ${view.name}`,
          ),
        );
      },

      setPin: async (pin) => {
        const lock = await hashPin(pin);
        await requireDb().put('settings', lock, LOCK_KEY);
        await requireDb().delete('settings', LOCK_RESET_KEY);
        set({ lock, lockReset: null, notice: 'Screen lock is on' });
      },

      removePin: async (pin) => {
        const { lock } = get();
        if (!lock || !(await verifyPin(pin, lock))) return false;
        await requireDb().delete('settings', LOCK_KEY);
        await requireDb().delete('settings', LOCK_RESET_KEY);
        set({ lock: null, lockReset: null, locked: false, notice: 'Screen lock is off' });
        return true;
      },

      unlock: async (pin) => {
        const { lock } = get();
        if (!lock) {
          set({ locked: false });
          return true;
        }
        const ok = await verifyPin(pin, lock);
        if (ok) {
          // Remembering the PIN cancels a pending "Forgot PIN?" reset.
          if (get().lockReset !== null) {
            await requireDb().delete('settings', LOCK_RESET_KEY);
            set({ lockReset: null, notice: 'PIN reset cancelled' });
          }
          set({ locked: false });
        }
        return ok;
      },

      requestPinReset: async () => {
        if (!get().lock || get().lockReset !== null) return;
        const at = Date.now();
        await requireDb().put('settings', at, LOCK_RESET_KEY);
        set({ lockReset: at });
      },

      applyPinResetIfDue: async () => {
        const { lock, lockReset } = get();
        if (lockReset === null) return false;
        if (!lock) {
          await requireDb().delete('settings', LOCK_RESET_KEY);
          set({ lockReset: null });
          return false;
        }
        if (!resetDue(lockReset, Date.now())) return false;
        const d = requireDb();
        await d.delete('settings', LOCK_KEY);
        await d.delete('settings', LOCK_RESET_KEY);
        set({
          lock: null,
          lockReset: null,
          locked: false,
          notice: 'Your PIN was removed after the 24-hour wait. All your entries are here.',
        });
        return true;
      },

      lockNow: () => {
        if (get().lock) set({ locked: true });
      },

      removeTransaction: async (id) => {
        const tx = get().transactions.find((t) => t.id === id);
        if (!tx) return;
        const label = `Deleted ${tx.merchant}`;
        const extra = dropSplitRows(tx);
        await get().run(
          extra.length === 0
            ? deleteTransaction(tx)
            : composite(label, [deleteTransaction(tx), ...extra]),
          label,
        );
      },

      setMonthBudgets: async (month, next, label = 'Updated budgets') => {
        const previous = get().budgets.filter((b) => b.month === month);
        const rows = toBudgetRows(month, next);
        const same =
          JSON.stringify(budgetsForMonth(previous, month)) ===
          JSON.stringify(budgetsForMonth(rows, month));
        if (same) return;
        await get().run(setMonthBudgetsCommand(previous, rows, label));
      },

      addCategory: async (name) => {
        const c = makeCategory(name, get().categories);
        await get().run(putCategories([], [c], `Added category ${c.name}`));
        return c.id;
      },

      renameCategory: async (id, name) => {
        const before = get().categories.find((c) => c.id === id);
        if (!before || isDefaultCategory(id) || before.name === name.trim()) return;
        await get().run(
          putCategories([before], [{ ...before, name: name.trim() }], `Renamed ${before.name}`),
        );
      },

      recolorCategory: async (id, color) => {
        const before = get().categories;
        const after = recolor(before, id, color);
        const changed = after.filter((c, i) => c.color !== before[i]?.color);
        if (changed.length === 0) return;
        const old = before.filter((c) => changed.some((x) => x.id === c.id));
        await get().run(putCategories(old, changed, 'Changed a category colour'));
      },

      moveCategory: async (id, toIndex) => {
        const before = get().categories;
        const after = reorder(before, id, toIndex);
        const changed = after.filter((c) => before.find((b) => b.id === c.id)?.order !== c.order);
        if (changed.length === 0) return;
        const old = before.filter((c) => changed.some((x) => x.id === c.id));
        await get().run(putCategories(old, changed, 'Reordered categories'));
      },

      deleteCategory: async (id, moveTo) => {
        const { categories, transactions, trash, rules, budgets } = get();
        const cat = categories.find((c) => c.id === id);
        if (!cat || id === OTHER_ID || isDefaultCategory(id) || id === moveTo) return;
        if (!categories.some((c) => c.id === moveTo)) return;
        const now = Date.now();
        const steps: Command[] = [];
        for (const t of transactions.filter((x) => x.categoryId === id))
          steps.push(
            updateTransaction(t, { ...t, categoryId: moveTo, unsure: false, updatedAt: now }),
          );
        for (const item of trash.filter((x) => x.tx.categoryId === id))
          steps.push(putTrashItem(item, { ...item, tx: { ...item.tx, categoryId: moveTo } }));
        for (const [key, categoryId] of Object.entries(rules)) {
          if (categoryId === id)
            steps.push(
              setRule(
                { key, categoryId: moveTo, updatedAt: now },
                { key, categoryId, updatedAt: now },
              ),
            );
        }
        // A deleted category's budget is added to the destination's for the same month.
        for (const month of new Set(budgets.filter((b) => b.scope === id).map((b) => b.month))) {
          const mb = budgetsForMonth(budgets, month);
          const moved = mb.categories[id] ?? 0;
          const next = { ...mb.categories, [moveTo]: (mb.categories[moveTo] ?? 0) + moved };
          delete next[id];
          steps.push(
            setMonthBudgetsCommand(
              budgets.filter((b) => b.month === month),
              toBudgetRows(month, { overall: mb.overall, categories: next }),
              'Moved budget',
            ),
          );
        }
        steps.push(removeCategoryRow(cat));
        const target = categories.find((c) => c.id === moveTo)!;
        const label = `Deleted ${cat.name}, moved its entries to ${target.name}`;
        await get().run(composite(label, steps), label);
      },

      saveRecurring: async (item, label) => {
        const previous = get().recurring.find((r) => r.id === item.id);
        if (!item.createdAt) item = { ...item, createdAt: Date.now() };
        await get().run(
          putRecurring(
            item,
            previous,
            label ??
              (previous ? `Updated ${item.merchant}` : `Added ${item.merchant} to recurring`),
          ),
        );
      },

      deleteRecurring: async (id) => {
        const item = get().recurring.find((r) => r.id === id);
        if (item) await get().run(removeRecurring(item));
      },

      shiftRecurring: async (id, days) => {
        const item = get().recurring.find((r) => r.id === id);
        if (!item || days === 0) return;
        const anchor = addDays(item.anchor, days);
        await get().run(putRecurring({ ...item, anchor }, item, `Moved ${item.merchant}`));
      },

      ignoreRecurring: async (key) => {
        const previous = get().recurringIgnored;
        if (previous.includes(key)) return;
        await get().run(setIgnoredRecurring([...previous, key], previous, `Not recurring: ${key}`));
      },

      importCsv: async (plan) => {
        if (plan.transactions.length === 0) return;
        const n = plan.transactions.length;
        const label = `Imported ${n} ${n === 1 ? 'entry' : 'entries'} from CSV`;
        await get().run(importTransactions(plan.transactions, plan.newCategories, label), label);
      },

      restoreBackup: async (file) => {
        const d = requireDb();
        const before = {
          transactions: await d.getAll('transactions'),
          categories: await d.getAll('categories'),
          rules: await d.getAll('rules'),
          budgets: await d.getAll('budgets'),
          recurring: await d.getAll('recurring'),
          accounts: await d.getAll('accounts'),
          flows: await d.getAll('flows'),
          people: await d.getAll('people'),
          udhaar: await d.getAll('udhaar'),
          loans: await d.getAll('loans'),
          goals: await d.getAll('goals'),
          wishlist: await d.getAll('wishlist'),
          assets: await d.getAll('assets'),
        };
        const after = {
          transactions: file.data.transactions,
          categories: file.data.categories.length > 0 ? file.data.categories : DEFAULT_CATEGORIES,
          rules: file.data.rules,
          budgets: file.data.budgets ?? [],
          recurring: file.data.recurring ?? [],
          accounts: file.data.accounts ?? [],
          flows: file.data.flows ?? [],
          people: file.data.people ?? [],
          udhaar: file.data.udhaar ?? [],
          loans: file.data.loans ?? [],
          goals: file.data.goals ?? [],
          wishlist: file.data.wishlist ?? [],
          assets: file.data.assets ?? [],
        };
        // Notes and drawings are never removed by a restore; the backup's missing ones are added.
        const haveNotes = new Set(get().notes.map((n) => n.id));
        const haveSketches = new Set(get().sketches.map((k) => k.id));
        const extra: Command[] = [
          ...(file.data.notes ?? [])
            .filter((n) => !haveNotes.has(n.id))
            .map((n) => putNote(n, undefined, 'Restored a note')),
          ...(file.data.sketches ?? [])
            .filter((k) => !haveSketches.has(k.id))
            .map((k) => putSketch(k, undefined, 'Restored a drawing')),
          ...listMerges(file),
        ];
        const replace = replaceEverything(before, after);
        await get().run(
          extra.length === 0 ? replace : composite(replace.label, [replace, ...extra]),
        );
      },

      getActivity: async () => {
        const events = await requireDb().getAll('audit');
        return events.sort((a, b) => b.at - a.at || (b.id ?? 0) - (a.id ?? 0));
      },

      importFromBackup: async (file) => {
        const { transactions, categories, rules, budgets } = get();
        const haveTx = new Set(transactions.map((t) => t.id));
        const haveCat = new Set(categories.map((c) => c.id));
        const newTx = file.data.transactions.filter((t) => !haveTx.has(t.id));
        const newCats = file.data.categories.filter((c) => !haveCat.has(c.id));
        const newRules = file.data.rules.filter((r) => !(r.key in rules));
        const haveBudget = new Set(budgets.map((b) => b.id));
        const newBudgets = (file.data.budgets ?? []).filter((b) => !haveBudget.has(b.id));
        const haveRecurring = new Set(get().recurring.map((r) => r.id));
        const newRecurring = (file.data.recurring ?? []).filter((r) => !haveRecurring.has(r.id));
        const haveNotes = new Set(get().notes.map((n) => n.id));
        const newNotes = (file.data.notes ?? []).filter((n) => !haveNotes.has(n.id));
        const haveSketches = new Set(get().sketches.map((k) => k.id));
        const newSketches = (file.data.sketches ?? []).filter((k) => !haveSketches.has(k.id));
        const lists = listMerges(file);
        const rows = rowMerges(file);
        if (
          rows.length === 0 &&
          lists.length === 0 &&
          newTx.length === 0 &&
          newCats.length === 0 &&
          newRules.length === 0 &&
          newBudgets.length === 0 &&
          newRecurring.length === 0 &&
          newNotes.length === 0 &&
          newSketches.length === 0
        ) {
          set({ notice: 'Nothing new in that backup' });
          return 0;
        }
        const label =
          newTx.length > 0
            ? `Imported ${newTx.length} ${newTx.length === 1 ? 'entry' : 'entries'}`
            : 'Imported categories, rules, budgets, recurring payments and notes';
        const steps: Command[] = [
          importTransactions(newTx, newCats, label),
          ...newRules.map((r) => setRule(r)),
          ...(newBudgets.length > 0 ? [setMonthBudgetsCommand([], newBudgets, label)] : []),
          ...newRecurring.map((r) => putRecurring(r, undefined, label)),
          ...newNotes.map((n) => putNote(n, undefined, label)),
          ...newSketches.map((k) => putSketch(k, undefined, label)),
          ...lists,
          ...rows,
        ];
        await get().run(steps.length === 1 ? steps[0]! : composite(label, steps), label);
        return newTx.length;
      },

      saveNote: async ({ id, anchor, page, text, stamp }) => {
        const clean = cleanNote(text);
        if (!clean && !stamp) return;
        const now = Date.now();
        const previous = id ? get().notes.find((n) => n.id === id) : undefined;
        const next: Note = previous
          ? { ...previous, text: clean, stamp, updatedAt: now }
          : { id: newId(), anchor, page, text: clean, stamp, createdAt: now, updatedAt: now };
        const label = previous ? 'Edited a note' : clean ? 'Added a note' : 'Added a stamp';
        await get().run(putNote(next, previous, label));
      },

      deleteNote: async (id) => {
        const note = get().notes.find((n) => n.id === id);
        if (note) await get().run(removeNote(note));
      },

      addStroke: async (page, month, stroke) => {
        const id = sketchId(page, month);
        const previous = get().sketches.find((s) => s.id === id);
        const strokes = fitCap([...(previous?.strokes ?? []), stroke]);
        const next: Sketch = { id, page, month, strokes, updatedAt: Date.now() };
        await get().run(putSketch(next, previous, 'Drew a stroke'), '');
      },

      eraseStrokes: async (page, month, ids) => {
        const id = sketchId(page, month);
        const previous = get().sketches.find((s) => s.id === id);
        if (!previous || ids.length === 0) return;
        const strokes = previous.strokes.filter((s) => !ids.includes(s.id));
        if (strokes.length === previous.strokes.length) return;
        const next: Sketch = { ...previous, strokes, updatedAt: Date.now() };
        await get().run(putSketch(next, previous, 'Erased'), '');
      },

      clearSketch: async (page, month) => {
        const id = sketchId(page, month);
        const previous = get().sketches.find((s) => s.id === id);
        if (!previous) return;
        await get().run(
          putSketch({ ...previous, strokes: [], updatedAt: Date.now() }, previous, 'Cleared'),
          'Cleared the drawing',
        );
      },

      loadSampleData: async () => {
        if (get().sample || get().transactions.some((t) => isSampleId(t.id))) return;
        const data = buildSample(todayISO(), get().budgets);
        await get().run(
          loadSampleCommand(data, undefined),
          `Loaded ${data.transactions.length} sample entries. Remove them in Settings any time.`,
        );
      },

      removeSampleData: async () => {
        // A backup restored on another device carries the entries but not the marker; the ids tell.
        const marker: SampleMarker | null =
          get().sample ??
          (get().transactions.some((t) => isSampleId(t.id))
            ? {
                transactionIds: get()
                  .transactions.filter((t) => isSampleId(t.id))
                  .map((t) => t.id),
                recurringIds: get()
                  .recurring.filter((r) => isSampleId(r.id))
                  .map((r) => r.id),
                budgets: [],
              }
            : null);
        if (!marker) return;
        const txIds = new Set(marker.transactionIds);
        const recIds = new Set(marker.recurringIds);
        const removed = {
          transactions: get().transactions.filter((t) => txIds.has(t.id)),
          recurring: get().recurring.filter((r) => recIds.has(r.id)),
          // Budgets the user changed since are theirs now.
          budgets: get().budgets.filter((b) =>
            marker.budgets.some((m) => m.id === b.id && m.amountMinor === b.amountMinor),
          ),
        };
        await get().run(removeSampleCommand(marker, removed), 'Removed the sample data');
      },

      undoMany: async (steps) => {
        let last: string | null = null;
        for (let i = 0; i < steps; i += 1) {
          const label = await bus?.undo();
          if (!label) break;
          last = label;
        }
        if (last)
          set({
            notice:
              steps === 1 ? `Undid: ${last}` : `Undid ${steps} changes, back to before ${last}`,
          });
      },

      undo: async () => {
        const label = await bus?.undo();
        if (label && !label.startsWith(SKETCH_LABEL)) set({ notice: `Undid: ${label}` });
      },
      redo: async () => {
        const label = await bus?.redo();
        if (label && !label.startsWith(SKETCH_LABEL)) set({ notice: `Redid: ${label}` });
      },

      setSetting: async (key, value) => {
        await requireDb().put('settings', value, key);
        const settings = { ...get().settings, [key]: value };
        if (key === 'monthStartDay') {
          // Before anything re-renders. Month totals are memoised on the entry list, so a new list
          // makes every page work its months out again.
          setMonthStartDay(value as number);
          set({ settings, transactions: [...get().transactions] });
        } else set({ settings });
        applyBoot(settings);
      },

      dismissNotice: () => set({ notice: null }),
    };
  });
}

export const useLedger = createLedgerStore();
