import { useState } from 'react';
import { useLedger } from '../data/store';
import { promptInstall, useInstallMode } from '../pwa/install';
import { href } from './router';

const DISMISS_KEY = 'ledger.installDismissed';

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

/** What to say about installing, for this browser. Shared by the Dashboard banner and Settings. */
export function InstallText() {
  const mode = useInstallMode();
  const count = useLedger((s) => s.transactions.length);
  switch (mode) {
    case 'prompt':
      return <p>Install Ledger for a home screen icon, full screen and offline use.</p>;
    case 'ios':
      return (
        <>
          <p>
            To install, tap Share, then Add to Home Screen. The installed app keeps its own data,
            separate from this browser, so install first, then add entries.
          </p>
          {count > 0 && (
            <p>
              This browser already holds {count === 1 ? '1 entry' : `${count} entries`}. Back them
              up here, then restore the backup in the installed app.{' '}
              <a href={href('/settings')}>Back up</a>
            </p>
          )}
        </>
      );
    case 'in-app':
      return (
        <p>
          This is a browser inside another app, which cannot install Ledger. Open this page in
          Safari or Chrome.
        </p>
      );
    default:
      return null;
  }
}

export function InstallButton() {
  const mode = useInstallMode();
  if (mode !== 'prompt') return null;
  return (
    <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
      Install Ledger
    </button>
  );
}

/** A one-time banner on the Dashboard when installing is possible. Not now hides it for good. */
export function InstallBanner() {
  const mode = useInstallMode();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed || mode === 'installed' || mode === 'none') return null;
  return (
    <div
      className="banner install-banner"
      role="region"
      aria-label="Install Ledger"
      data-testid="install-banner"
    >
      <div className="banner-text">
        <InstallText />
      </div>
      <div className="btn-row">
        <InstallButton />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, '1');
            } catch {
              /* it just comes back next time */
            }
            setDismissed(true);
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
