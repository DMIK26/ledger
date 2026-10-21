import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AuditEvent,
  Budget,
  Category,
  MerchantRule,
  Transaction,
  TrashItem,
} from '../domain/types';
import type { RecurringItem } from '../domain/recurring';
import type { Note } from '../domain/notes';
import type { Sketch } from '../domain/sketch';
import { MIGRATIONS } from './migrations';

export interface LedgerDB extends DBSchema {
  transactions: {
    key: string;
    value: Transaction;
    indexes: { 'by-date': string; 'by-category': string };
  };
  categories: { key: string; value: Category };
  rules: { key: string; value: MerchantRule };
  settings: { key: string; value: unknown };
  audit: { key: number; value: AuditEvent };
  trash: { key: string; value: TrashItem; indexes: { 'by-deleted': number } };
  budgets: { key: string; value: Budget };
  recurring: { key: string; value: RecurringItem };
  notes: { key: string; value: Note };
  sketches: { key: string; value: Sketch };
  receipts: { key: string; value: Blob };
}

export type Db = IDBPDatabase<LedgerDB>;

export const DB_NAME = 'ledger-db';
export const DB_VERSION = MIGRATIONS.length;

export function openLedgerDB(name: string = DB_NAME): Promise<Db> {
  return openDB<LedgerDB>(name, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      const target = newVersion ?? DB_VERSION;
      for (let v = oldVersion; v < target; v += 1) MIGRATIONS[v]!(db, tx);
    },
  });
}
