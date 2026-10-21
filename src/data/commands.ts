import type { Category, MerchantRule, Transaction } from '../domain/types';
import type { Db } from './db';

/** Every data change is a Command, so it can be undone, redone and written to the audit log. */
export interface Command {
  label: string;
  apply(db: Db): Promise<void>;
  revert(db: Db): Promise<void>;
}

export const addTransaction = (tx: Transaction): Command => ({
  label: `Added ${tx.merchant}`,
  apply: async (db) => {
    await db.put('transactions', tx);
  },
  revert: async (db) => {
    await db.delete('transactions', tx.id);
  },
});

export const updateTransaction = (before: Transaction, after: Transaction): Command => ({
  label: `Edited ${after.merchant}`,
  apply: async (db) => {
    await db.put('transactions', after);
  },
  revert: async (db) => {
    await db.put('transactions', before);
  },
});

/** Deleting moves the entry to Trash, where it stays restorable for 30 days. */
export const deleteTransaction = (tx: Transaction, now: number = Date.now()): Command => ({
  label: `Deleted ${tx.merchant}`,
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
  label: `Remembered ${rule.key}`,
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
  label = `Imported ${transactions.length} entries`,
): Command => ({
  label,
  apply: async (db) => {
    const t = db.transaction(['transactions', 'categories'], 'readwrite');
    for (const c of newCategories) void t.objectStore('categories').put(c);
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
  apply: async (db) => {
    for (const c of commands) await c.apply(db);
  },
  revert: async (db) => {
    for (const c of [...commands].reverse()) await c.revert(db);
  },
});
