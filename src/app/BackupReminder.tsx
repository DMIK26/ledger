import { useState } from 'react';
import { useLedger } from '../data/store';
import { backupFile } from './backupFile';
import { ExportButton } from './files';
import { useInstallMode } from '../pwa/install';
import { tl } from '../domain/i18n';

export const BACKUP_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

const onPhone = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

/**
 * On phones, a gentle nudge when the last backup is more than a week old. "Back up now" saves it at once
 * (the share sheet, so Save to Files on an iPhone); Not now hides it until reload. With a weekly folder
 * backup set up, the folder takes care of it instead.
 */
export function BackupReminder() {
  const count = useLedger((s) => s.transactions.length);
  const lastBackupAt = useLedger((s) => s.settings.lastBackupAt);
  const folder = useLedger((s) => s.settings.folderBackupName);
  const getDb = useLedger((s) => s.getDb);
  const setSetting = useLedger((s) => s.setSetting);
  const [hidden, setHidden] = useState(false);
  const [now] = useState(() => Date.now());
  const mode = useInstallMode();
  // In a phone browser tab the install banner already says to back up and move to the app.
  if (mode === 'ios' || mode === 'in-app' || folder) return null;
  if (hidden || count === 0 || !onPhone() || now - lastBackupAt < BACKUP_EVERY_MS) return null;
  return (
    <div className="banner" role="status" data-testid="backup-reminder">
      <p>
        {lastBackupAt === 0
          ? tl('Your entries live only on this phone. Save a backup somewhere safe.')
          : tl('It has been over a week since your last backup.')}
      </p>
      <ExportButton
        label={tl('Back up now')}
        build={() => backupFile(getDb())}
        onDone={() => {
          void setSetting('lastBackupAt', Date.now());
          setHidden(true);
        }}
      />
      <button type="button" className="btn btn-ghost" onClick={() => setHidden(true)}>
        {tl('Not now')}
      </button>
    </div>
  );
}
