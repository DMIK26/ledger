import type { Db } from '../data/db';
import { backupFile } from './backupFile';

/**
 * Weekly backup to a folder (Drop 13), where the browser can write to one (Chrome on a computer or
 * Android). The folder's handle is kept in the settings store; the browser may ask again for
 * permission, which needs a tap.
 */

export const FOLDER_HANDLE_KEY = 'backupFolderHandle';
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Permission = 'granted' | 'prompt' | 'denied';
interface DirHandle {
  name: string;
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<Permission>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<Permission>;
  getFileHandle: (
    name: string,
    o: { create: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (d: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

// The handle in use this session; also the fallback where the browser cannot store it.
let current: DirHandle | null = null;

async function handleFor(db: Db): Promise<DirHandle | null> {
  if (current) return current;
  try {
    current = ((await db.get('settings', FOLDER_HANDLE_KEY)) as DirHandle | undefined) ?? null;
  } catch {
    current = null;
  }
  return current;
}

export const canUseFolder = (): boolean =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function chooseFolder(db: Db): Promise<string | null> {
  const pick = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> })
    .showDirectoryPicker;
  try {
    const handle = await pick({ id: 'ledger-backups', mode: 'readwrite' });
    current = handle;
    try {
      await db.put('settings', handle, FOLDER_HANDLE_KEY);
    } catch {
      // Kept for this session only; Ledger asks for the folder again next time.
    }
    return handle.name;
  } catch {
    // Cancelled, or the browser said no.
    return null;
  }
}

export async function forgetFolder(db: Db): Promise<void> {
  current = null;
  await db.delete('settings', FOLDER_HANDLE_KEY);
}

export async function folderPermission(db: Db): Promise<Permission | 'none'> {
  const handle = await handleFor(db);
  if (!handle) return 'none';
  return (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
}

/**
 * Writes this week's backup into the folder. With `ask`, it may show the browser's permission prompt
 * (only from a tap). Returns false when there is no folder or no permission.
 */
export async function backUpToFolder(db: Db, ask: boolean): Promise<boolean> {
  const handle = await handleFor(db);
  if (!handle) return false;
  let permission = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (permission === 'prompt' && ask)
    permission = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
  if (permission !== 'granted') return false;
  try {
    const file = await backupFile(db);
    const target = await handle.getFileHandle(file.name, { create: true });
    const out = await target.createWritable();
    await out.write(file);
    await out.close();
    return true;
  } catch {
    return false;
  }
}
