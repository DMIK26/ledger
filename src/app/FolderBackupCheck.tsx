import { useEffect, useState } from 'react';
import { useLedger } from '../data/store';
import { backUpToFolder, folderPermission, WEEK_MS } from './folderBackup';
import { tl } from '../domain/i18n';

/**
 * Mounted while a weekly folder backup is set up (Drop 13). When a week has passed it writes the backup
 * by itself, or, when the browser wants permission again, asks with one tap.
 */
export function FolderBackupCheck() {
  const getDb = useLedger((s) => s.getDb);
  const name = useLedger((s) => s.settings.folderBackupName);
  const at = useLedger((s) => s.settings.folderBackupAt);
  const count = useLedger((s) => s.transactions.length);
  const setSetting = useLedger((s) => s.setSetting);
  const [ask, setAsk] = useState<'permission' | 'failed' | null>(null);

  const done = async () => {
    const now = Date.now();
    await setSetting('folderBackupAt', now);
    await setSetting('lastBackupAt', now);
    useLedger.setState({ notice: tl('Saved this week’s backup in {0}', name) });
  };

  useEffect(() => {
    let live = true;
    if (!name || count === 0 || Date.now() - at < WEEK_MS) return;
    void (async () => {
      const permission = await folderPermission(getDb());
      if (!live) return;
      if (permission === 'prompt') return setAsk('permission');
      if (permission !== 'granted') return setAsk('failed');
      const ok = await backUpToFolder(getDb(), false);
      if (!live) return;
      if (ok) await done();
      else setAsk('failed');
    })();
    return () => {
      live = false;
    };
    // Checked when Ledger opens and whenever the folder changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, at]);

  if (!ask) return null;
  return (
    <div className="banner" role="status" data-testid="folder-backup-ask">
      <p>
        {ask === 'permission'
          ? tl('Time for this week’s backup to {0}. The browser wants your permission again.', name)
          : tl(
              'Ledger could not save this week’s backup in {0}. Choose the folder again in Settings.',
              name,
            )}
      </p>
      {ask === 'permission' && (
        <button
          type="button"
          className="btn"
          onClick={() =>
            void backUpToFolder(getDb(), true).then(async (ok) => {
              if (ok) {
                setAsk(null);
                await done();
              } else setAsk('failed');
            })
          }
        >
          {tl('Back up')}
        </button>
      )}
      <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>
        {tl('Not now')}
      </button>
    </div>
  );
}
