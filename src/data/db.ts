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
import type { Account, Flow } from '../domain/accounts';
import type { Person, UdhaarEntry } from '../domain/udhaar';
import type { Loan } from '../domain/loans';
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
  /** Drop 9 (schema v2). */
  accounts: { key: string; value: Account };
  flows: { key: string; value: Flow; indexes: { 'by-date': string } };
  people: { key: string; value: Person };
  udhaar: { key: string; value: UdhaarEntry; indexes: { 'by-person': string } };
  loans: { key: string; value: Loan };
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
