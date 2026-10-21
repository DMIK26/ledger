import { useEffect, useState, type ChangeEvent } from 'react';
import { exportBackup, validateBackup, type BackupFile } from '../../data/backup';
import { useLedger } from '../../data/store';
import { fmtDate, MONTHS, todayISO } from '../../domain/dates';
import { CURRENCIES } from '../../domain/money';
import type { ThemeChoice } from '../../domain/types';
import { checkForUpdates, usePwaState } from '../../pwa/register';
import { Money, usePrivacy } from '../Money';

const THEMES: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function Appearance() {
  const theme = useLedger((s) => s.settings.theme);
  const setSetting = useLedger((s) => s.setSetting);
  return (
    <section className="card" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Appearance</h2>
      <div className="segmented" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={theme === t.value}
            onClick={() => void setSetting('theme', t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Privacy() {
  const privacy = usePrivacy();
  const setSetting = useLedger((s) => s.setSetting);
  return (
    <section className="card" aria-labelledby="privacy-title">
      <div className="field-row">
        <div>
          <h2 id="privacy-title">Privacy mode</h2>
          <p className="muted small">
            Hides every amount on screen, for when someone is looking over your shoulder.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={privacy}
          aria-labelledby="privacy-title"
          onClick={() => void setSetting('privacy', !privacy)}
        />
      </div>
      <p className="preview">
        <span className="muted small">Sample</span>
        <Money minor={123456} />
      </p>
    </section>
  );
}

function MoneySettings() {
  const currency = useLedger((s) => s.settings.currency);
  const fyStartMonth = useLedger((s) => s.settings.fyStartMonth);
  const setSetting = useLedger((s) => s.setSetting);
  return (
    <section className="card" aria-labelledby="money-title">
      <h2 id="money-title">Money</h2>
      <div className="field-row">
        <label htmlFor="currency">Currency for new entries</label>
        <select
          id="currency"
          className="select"
          value={currency}
          onChange={(e) => void setSetting('currency', e.target.value)}
        >
          {Object.entries(CURRENCIES).map(([code, info]) => (
            <option key={code} value={code}>
              {code} ({info.symbol})
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <label htmlFor="fy-start">Financial year starts in</label>
        <select
          id="fy-start"
          className="select"
          value={fyStartMonth}
          onChange={(e) => void setSetting('fyStartMonth', Number(e.target.value))}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

async function shareOrDownload(file: File): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], title: file.name });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      /* share failed for another reason: fall back to a download */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Data() {
  const getDb = useLedger((s) => s.getDb);
  const count = useLedger((s) => s.transactions.length);
  const importFromBackup = useLedger((s) => s.importFromBackup);
  const privacy = usePrivacy();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doExport = async () => {
    setConfirming(false);
    setBusy(true);
    try {
      const backup = await exportBackup(getDb());
      const file = new File([JSON.stringify(backup, null, 2)], `ledger-backup-${todayISO()}.json`, {
        type: 'application/json',
      });
      await shareOrDownload(file);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setPending(null);
    setError(null);
    if (!file) return;
    try {
      const backup = validateBackup(JSON.parse(await file.text()));
      if (backup) setPending(backup);
      else setError('That file is not a Ledger backup, or it is damaged. Nothing was imported.');
    } catch {
      setError('That file is not a Ledger backup, or it is damaged. Nothing was imported.');
    }
  };

  const dates = pending?.data.transactions.map((t) => t.date).sort() ?? [];

  return (
    <section className="card" aria-labelledby="data-title">
      <h2 id="data-title">Data</h2>
      <p className="muted small">
        Everything lives on this device. A backup is a file you keep somewhere safe and can restore
        here or on another phone.
      </p>
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          disabled={busy || count === 0}
          onClick={() => (privacy ? setConfirming(true) : void doExport())}
        >
          Export backup
        </button>
        <label className="btn">
          Import backup
          <input
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(e) => void onFile(e)}
          />
        </label>
      </div>
      {confirming && (
        <div className="preview" role="alert">
          <p>The backup file contains real amounts, even with privacy mode on.</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void doExport()}>
              Export anyway
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <div className="preview">
          <p>
            {pending.data.transactions.length === 1
              ? '1 entry'
              : `${pending.data.transactions.length} entries`}
            {dates.length > 0 && `, ${fmtDate(dates[0]!)} to ${fmtDate(dates[dates.length - 1]!)}`}.
            Entries already on this device are skipped. You can undo the import.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const file = pending;
                setPending(null);
                void importFromBackup(file);
              }}
            >
              Import
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function formatMB(bytes: number): string {
  const tenths = Math.round(bytes / 104_857.6);
  return `${Math.floor(tenths / 10)}.${tenths % 10} MB`;
}

function Storage() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const supported =
    typeof navigator !== 'undefined' && 'storage' in navigator && !!navigator.storage;

  useEffect(() => {
    if (!supported) return;
    void navigator.storage.persisted?.().then(setPersisted);
    void navigator.storage.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(formatMB(e.usage));
    });
  }, [supported]);

  return (
    <section className="card" aria-labelledby="storage-title">
      <h2 id="storage-title">Storage</h2>
      {!supported ? (
        <p className="muted small">This browser does not report storage details.</p>
      ) : (
        <>
          <p className="muted small">
            {persisted
              ? 'Protected: the browser will not clear your data to free space.'
              : 'Not protected yet: the browser may clear data when the device runs low on space.'}
            {usage && ` Using ${usage}.`}
          </p>
          {!persisted && (
            <button
              type="button"
              className="btn"
              onClick={() => void navigator.storage.persist().then(setPersisted)}
            >
              Keep my data
            </button>
          )}
        </>
      )}
    </section>
  );
}

function About() {
  const pwa = usePwaState();
  const [result, setResult] = useState<string | null>(null);
  return (
    <section className="card" aria-labelledby="about-title">
      <h2 id="about-title">About</h2>
      <p className="muted small">
        Ledger {__APP_VERSION__}.{' '}
        {pwa.installed ? 'Installed as an app.' : 'Running in the browser.'}
      </p>
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          disabled={pwa.checking}
          onClick={() =>
            void checkForUpdates().then((found) =>
              setResult(found ? 'An update is ready.' : 'You have the latest version.'),
            )
          }
        >
          Check for updates
        </button>
      </div>
      {result && (
        <p className="muted small" role="status">
          {result}
        </p>
      )}
    </section>
  );
}

export function Settings() {
  return (
    <>
      <Appearance />
      <Privacy />
      <MoneySettings />
      <Data />
      <Storage />
      <About />
    </>
  );
}
