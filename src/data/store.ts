import { create } from 'zustand';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { categorise, normalizeMerchantKey } from '../domain/categoriser';
import type { SavedView } from '../domain/filters';
import { budgetsForMonth, toBudgetRows, type MonthBudgets } from '../domain/budgets';
import { addDays } from '../domain/dates';
import { isDefaultCategory, makeCategory, OTHER_ID, recolor, reorder } from '../domain/categories';
import type { ImportPlan } from '../domain/csvImport';
import type { RecurringItem } from '../domain/recurring';
import type { AuditEvent } from '../domain/types';
import { cleanNote, type Note, type StampKind } from '../domain/notes';
import { fitCap, sketchId, type Sketch, type Stroke } from '../domain/sketch';
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
  putNote,
  removeNote,
  putSketch,
  SKETCH_LABEL,
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
  recurring: RecurringItem[];
  /** Merchant keys the user said are not recurring. */
  recurringIgnored: string[];
  views: SavedView[];
  /** Notes and stamps attached to things on the pages. */
  notes: Note[];
  /** Saved drawings, one per page and month. */
  sketches: Sketch[];
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
      ]);
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
        };
        const after = {
          transactions: file.data.transactions,
          categories: file.data.categories.length > 0 ? file.data.categories : DEFAULT_CATEGORIES,
          rules: file.data.rules,
          budgets: file.data.budgets ?? [],
          recurring: file.data.recurring ?? [],
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
        if (
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
        set({ settings });
        applyBoot(settings);
      },

      dismissNotice: () => set({ notice: null }),
    };
  });
}

export const useLedger = createLedgerStore();
