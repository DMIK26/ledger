import { exportBackup } from '../data/backup';
import type { Db } from '../data/db';
import { todayISO } from '../domain/dates';

/** The backup as a file, protected with a password when one is given (Drop 13). */
export async function backupFile(db: Db, password?: string): Promise<File> {
  const json = JSON.stringify(await exportBackup(db), null, 2);
  const body = password
    ? JSON.stringify(await (await import('../domain/backupCrypto')).protectBackup(json, password))
    : json;
  return new File([body], `ledger-backup-${todayISO()}.json`, { type: 'application/json' });
}
