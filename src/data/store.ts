import { create } from 'zustand';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { normalizeMerchantKey } from '../domain/categoriser';
import { setPrivacy } from '../domain/money';
import type { ParsedEntry } from '../domain/parser';
import {
  DEFAULT_SETTINGS, type Category, type CategoryId, type Settings, type Transaction,
} from '../domain/types';
import { loadSettings, type BackupFile } from './backup';
import { CommandBus, purgeTrash } from './bus';
import {
  addTransaction, composite, deleteTransaction, importTransactions, setRule, type Command,
} from './commands';
import { DB_NAME, openLedgerDB, type Db } from './db';

export interface LedgerState {
  ready: boolean;
  error: string | null;
  transactions: Transaction[];
  categories: Category[];
  rules: Record<string, CategoryId>;
  settings: Settings;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  notice: string | null;
  init: () => Promise<void>;
  getDb: () => Db;
  run: (command: Command, notice?: string) => Promise<void>;
  addFromParsed: (parsed: ParsedEntry, categoryId?: CategoryId) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
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

const newId = (): string =>
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
      const [transactions, categories, rules] = await Promise.all([
        d.getAll('transactions'),
        d.getAll('categories'),
        d.getAll('rules'),
      ]);
      transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
      categories.sort((a, b) => a.order - b.order);
      set({
        transactions,
        categories,
        rules: Object.fromEntries(rules.map((r) => [r.key, r.categoryId])),
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
      settings: DEFAULT_SETTINGS,
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
            applyBoot(settings);
            await refresh();
            set({ settings, ready: true, error: null });
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

      addFromParsed: async (parsed, categoryId) => {
        if (!parsed.ok || parsed.amountMinor === null) return;
        const { settings, rules } = get();
        const now = Date.now();
        const chosen = categoryId ?? parsed.categoryId;
        const tx: Transaction = {
          id: newId(),
          date: parsed.date,
          amountMinor: parsed.amountMinor,
          currency: settings.currency,
          merchant: parsed.merchant,
          categoryId: chosen,
          method: parsed.method,
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
        if (parsed.methodTyped && parsed.method !== settings.lastMethod) {
          await get().setSetting('lastMethod', parsed.method);
        }
      },

      removeTransaction: async (id) => {
        const tx = get().transactions.find((t) => t.id === id);
        if (tx) await get().run(deleteTransaction(tx), `Deleted ${tx.merchant}`);
      },

      importFromBackup: async (file) => {
        const { transactions, categories, rules } = get();
        const haveTx = new Set(transactions.map((t) => t.id));
        const haveCat = new Set(categories.map((c) => c.id));
        const newTx = file.data.transactions.filter((t) => !haveTx.has(t.id));
        const newCats = file.data.categories.filter((c) => !haveCat.has(c.id));
        const newRules = file.data.rules.filter((r) => !(r.key in rules));
        if (newTx.length === 0 && newCats.length === 0 && newRules.length === 0) {
          set({ notice: 'Nothing new in that backup' });
          return 0;
        }
        const label = `Imported ${newTx.length} ${newTx.length === 1 ? 'entry' : 'entries'}`;
        const steps: Command[] = [importTransactions(newTx, newCats, label), ...newRules.map((r) => setRule(r))];
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
