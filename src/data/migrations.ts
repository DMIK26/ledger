import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { LedgerDB } from './db';

export type Migration = (
  db: IDBPDatabase<LedgerDB>,
  tx: IDBPTransaction<LedgerDB, StoreNames<LedgerDB>[], 'versionchange'>,
) => void;

/**
 * Ordered schema steps. The database version is MIGRATIONS.length, so a new step is a new
 * array entry and never an edit to an old one. Existing user data is never dropped here.
 */
export const MIGRATIONS: Migration[] = [
  // v1: the initial schema.
  (db) => {
    const tx = db.createObjectStore('transactions', { keyPath: 'id' });
    tx.createIndex('by-date', 'date');
    tx.createIndex('by-category', 'categoryId');
    db.createObjectStore('categories', { keyPath: 'id' });
    db.createObjectStore('rules', { keyPath: 'key' });
    db.createObjectStore('settings');
    db.createObjectStore('audit', { keyPath: 'id', autoIncrement: true });
    const trash = db.createObjectStore('trash', { keyPath: 'id' });
    trash.createIndex('by-deleted', 'deletedAt');
    db.createObjectStore('budgets', { keyPath: 'id' });
    db.createObjectStore('recurring', { keyPath: 'id' });
    db.createObjectStore('notes', { keyPath: 'id' });
    db.createObjectStore('sketches', { keyPath: 'id' });
    db.createObjectStore('receipts');
  },
  // v2 (Drop 9): accounts, money in, transfers and fees, udhaar, loans. Spending stays in transactions.
  (db) => {
    db.createObjectStore('accounts', { keyPath: 'id' });
    const flows = db.createObjectStore('flows', { keyPath: 'id' });
    flows.createIndex('by-date', 'date');
    db.createObjectStore('people', { keyPath: 'id' });
    const udhaar = db.createObjectStore('udhaar', { keyPath: 'id' });
    udhaar.createIndex('by-person', 'personId');
    db.createObjectStore('loans', { keyPath: 'id' });
  },
  // v3 (Drop 10): goals and funds, the wishlist, and assets for net worth.
  (db) => {
    db.createObjectStore('goals', { keyPath: 'id' });
    db.createObjectStore('wishlist', { keyPath: 'id' });
    db.createObjectStore('assets', { keyPath: 'id' });
  },
];
