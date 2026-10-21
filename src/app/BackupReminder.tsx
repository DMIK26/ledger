import { useState } from 'react';
import { useLedger } from '../data/store';
import { href } from './router';
import { useInstallMode } from '../pwa/install';

export const BACKUP_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

const onPhone = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

/** On phones, a gentle nudge when the last backup is more than a week old. Not now hides it until reload. */
export function BackupReminder() {
  const count = useLedger((s) => s.transactions.length);
  const lastBackupAt = useLedger((s) => s.settings.lastBackupAt);
  const [hidden, setHidden] = useState(false);
  const [now] = useState(() => Date.now());
  const mode = useInstallMode();
  // In a phone browser tab the install banner already says to back up and move to the app.
  if (mode === 'ios' || mode === 'in-app') return null;
  if (hidden || count === 0 || !onPhone() || now - lastBackupAt < BACKUP_EVERY_MS) return null;
  return (
    <div className="banner" role="status" data-testid="backup-reminder">
      <p>
        {lastBackupAt === 0
          ? 'Your entries live only on this phone. Save a backup somewhere safe.'
          : 'It has been over a week since your last backup.'}
      </p>
      <a className="btn" href={href('/settings')}>
        Back up
      </a>
      <button type="button" className="btn btn-ghost" onClick={() => setHidden(true)}>
        Not now
      </button>
    </div>
  );
}
