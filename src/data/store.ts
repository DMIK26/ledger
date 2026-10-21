import { create } from 'zustand';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { categorise, normalizeMerchantKey } from '../domain/categoriser';
import type { SavedView } from '../domain/filters';
import { budgetsForMonth, toBudgetRows, type MonthBudgets } from '../domain/budgets';
import { hashPin, resetDue, verifyPin } from '../domain/pin';
import { setPrivacy } from '../domain/money';
import type { ParsedEntry } from '../domain/parser';
import {
  DEFAULT_SETTINGS,
  type Budget,
  type Category,
  type CategoryId,
  type ISODate,
  type LockConfig,
  type PaymentMethod,
  type Settings,
  type Transaction,
  type TrashItem,
} from '../domain/types';
import { loadSettings, type BackupFile } from './backup';
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
  setReceipt,
  setRule,
  setViews,
  updateTransaction,
  VIEWS_KEY,
  type Command,
} from './commands';
import { DB_NAME, openLedgerDB, type Db } from './db';

/** What the add and edit forms produce. */
export interface EntryDraft {
  date: ISODate;
  amountMinor: number;
  merchant: string;
  categoryId: CategoryId;
  method: PaymentMethod;
  notes: string;
  tags: string[];
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
  views: SavedView[];
  settings: Settings;
  lock: LockConfig | null;
  /** True while the PIN screen is up. */
  locked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  notice: string | null;
  init: () => Promise<void>;
  getDb: () => Db;
  run: (command: Command, notice?: string) => Promise<void>;
  addFromParsed: (
    parsed: ParsedEntry,
    categoryId?: CategoryId,
    extra?: { date?: ISODate; method?: PaymentMethod },
  ) => Promise<void>;
  addEntry: (draft: EntryDraft, receipt?: Blob | null) => Promise<void>;
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
  /** Epoch ms when a forgotten-PIN reset was requested, or null. */
  lockReset: number | null;
  requestPinReset: () => Promise<void>;
  /** Removes the PIN if a requested reset has waited 24 hours. Returns true when it did. */
  applyPinResetIfDue: () => Promise<boolean>;
  /** Merges a Ledger backup: adds entries, categories and rules this device lacks. Undoable. */
  importFromBackup: (file: BackupFile) => Promise<number>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  dismissNotice: () => void;
}

/** Theme and privacy are mirrored to localStorage so the page can paint correctly before React loads. */
export function applyBoot(settings: Pick<Settings, 'theme' | 'privacy'>): void {
  setPrivacy(settings.privacy);
  if (typeof document !== 'undefined') {
    if (settings.theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
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

    const refresh = async (): Promise<void> => {
      const d = requireDb();
      const [transactions, categories, rules, trash, views, budgets] = await Promise.all([
        d.getAll('transactions'),
        d.getAll('categories'),
        d.getAll('rules'),
        d.getAll('trash'),
        d.get('settings', VIEWS_KEY),
        d.getAll('budgets'),
      ]);
      trash.sort((a, b) => b.deletedAt - a.deletedAt);
      transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
      categories.sort((a, b) => a.order - b.order);
      set({
        transactions,
        categories,
        rules: Object.fromEntries(rules.map((r) => [r.key, r.categoryId])),
        trash,
        budgets,
        views: Array.isArray(views) ? (views as SavedView[]) : [],
        canUndo: bus?.canUndo ?? false,
        canRedo: bus?.canRedo ?? false,
        undoLabel: bus?.undoLabel ?? null,
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
      views: [],
      settings: DEFAULT_SETTINGS,
      lock: null,
      locked: false,
      lockReset: null,
      canUndo: false,
      canRedo: false,
      undoLabel: null,
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

      addEntry: async (draft, receipt) => {
        const { settings, rules } = get();
        const now = Date.now();
        const tx: Transaction = {
          id: newId(),
          ...draft,
          currency: settings.currency,
          source: 'form',
          unsure: false,
          hasReceipt: receipt ? true : undefined,
          createdAt: now,
          updatedAt: now,
        };
        const steps: Command[] = [addTransaction(tx)];
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
        const after: Transaction = {
          ...before,
          ...draft,
          unsure: before.unsure && !categoryChanged ? true : false,
          hasReceipt: receipt === undefined ? before.hasReceipt : receipt !== null || undefined,
          updatedAt: now,
        };
        const steps: Command[] = [updateTransaction(before, after)];
        if (receipt !== undefined) {
          const previous = before.hasReceipt ? await requireDb().get('receipts', id) : undefined;
          steps.push(setReceipt(id, receipt, previous));
        }
        const key = normalizeMerchantKey(after.merchant);
        if (before.unsure && categoryChanged && key) {
          const previous = get().rules[key];
          steps.push(
            setRule(
              { key, categoryId: after.categoryId, updatedAt: now },
              previous ? { key, categoryId: previous, updatedAt: now } : undefined,
            ),
          );
        }
        const label = `Edited ${after.merchant}`;
        await get().run(steps.length === 1 ? steps[0]! : composite(label, steps), label);
      },

      bulkDelete: async (ids) => {
        const list = get().transactions.filter((t) => ids.includes(t.id));
        if (list.length === 0) return;
        const label = `Deleted ${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;
        await get().run(
          composite(
            label,
            list.map((t) => deleteTransaction(t)),
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
        if (item) await get().run(restoreFromTrash(item));
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
        if (tx) await get().run(deleteTransaction(tx), `Deleted ${tx.merchant}`);
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

      importFromBackup: async (file) => {
        const { transactions, categories, rules, budgets } = get();
        const haveTx = new Set(transactions.map((t) => t.id));
        const haveCat = new Set(categories.map((c) => c.id));
        const newTx = file.data.transactions.filter((t) => !haveTx.has(t.id));
        const newCats = file.data.categories.filter((c) => !haveCat.has(c.id));
        const newRules = file.data.rules.filter((r) => !(r.key in rules));
        const haveBudget = new Set(budgets.map((b) => b.id));
        const newBudgets = (file.data.budgets ?? []).filter((b) => !haveBudget.has(b.id));
        if (
          newTx.length === 0 &&
          newCats.length === 0 &&
          newRules.length === 0 &&
          newBudgets.length === 0
        ) {
          set({ notice: 'Nothing new in that backup' });
          return 0;
        }
        const label =
          newTx.length > 0
            ? `Imported ${newTx.length} ${newTx.length === 1 ? 'entry' : 'entries'}`
            : 'Imported categories, rules and budgets';
        const steps: Command[] = [
          importTransactions(newTx, newCats, label),
          ...newRules.map((r) => setRule(r)),
          ...(newBudgets.length > 0 ? [setMonthBudgetsCommand([], newBudgets, label)] : []),
        ];
        await get().run(steps.length === 1 ? steps[0]! : composite(label, steps), label);
        return newTx.length;
      },

      undo: async () => {
        const label = await bus?.undo();
        if (label) set({ notice: `Undid: ${label}` });
      },
      redo: async () => {
        const label = await bus?.redo();
        if (label) set({ notice: `Redid: ${label}` });
      },

      setSetting: async (key, value) => {
        await requireDb().put('settings', value, key);
        const settings = { ...get().settings, [key]: value };
        set({ settings });
        applyBoot(settings);
      },

      dismissNotice: () => set({ notice: null }),
    };
  });
}

export const useLedger = createLedgerStore();
