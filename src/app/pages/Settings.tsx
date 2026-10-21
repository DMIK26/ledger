import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { exportBackup, validateBackup, type BackupFile } from '../../data/backup';
import { useLedger } from '../../data/store';
import { fmtDate, MONTHS, todayISO } from '../../domain/dates';
import { categoryById } from '../../domain/categories';
import { CURRENCIES } from '../../domain/money';
import { isValidPin } from '../../domain/pin';
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

function ScreenLock() {
  const hasLock = useLedger((s) => s.lock !== null);
  const setPin = useLedger((s) => s.setPin);
  const removePin = useLedger((s) => s.removePin);
  const lockNow = useLedger((s) => s.lockNow);
  const [mode, setMode] = useState<'idle' | 'set' | 'remove'>('idle');
  const [pin, setPinText] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode('idle');
    setPinText('');
    setAgain('');
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'set') {
      if (!isValidPin(pin)) return setError('Use 4 to 8 digits.');
      if (pin !== again) return setError('The two PINs do not match.');
      setBusy(true);
      await setPin(pin);
      setBusy(false);
      reset();
    } else if (mode === 'remove') {
      setBusy(true);
      const ok = await removePin(pin);
      setBusy(false);
      if (ok) reset();
      else {
        setError('That PIN is not right.');
        setPinText('');
      }
    }
  };

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8);

  return (
    <section className="card" aria-labelledby="lock-title">
      <h2 id="lock-title">Screen lock</h2>
      <p className="muted small">
        A 4 to 8 digit PIN, asked when Ledger opens and after 30 seconds in the background. It keeps
        casual viewers out. It does not encrypt your data.
      </p>
      <p className="muted small">
        Forgot it? Tap Forgot PIN on the lock screen. Ledger removes the PIN after 24 hours and
        keeps every entry. Entering the right PIN before then cancels it.
      </p>
      {mode === 'idle' && (
        <div className="btn-row">
          {hasLock ? (
            <>
              <button type="button" className="btn" onClick={lockNow}>
                Lock now
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setMode('remove')}>
                Turn off
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setMode('set')}>
              Set a PIN
            </button>
          )}
        </div>
      )}
      {mode !== 'idle' && (
        <form className="lock-settings" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="pin-1">{mode === 'set' ? 'New PIN' : 'Current PIN'}</label>
            <input
              id="pin-1"
              className="input pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(e) => {
                setPinText(digits(e.target.value));
                setError(null);
              }}
            />
          </div>
          {mode === 'set' && (
            <div className="field">
              <label htmlFor="pin-2">Repeat the PIN</label>
              <input
                id="pin-2"
                className="input pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={again}
                onChange={(e) => {
                  setAgain(digits(e.target.value));
                  setError(null);
                }}
              />
            </div>
          )}
          {error && (
            <p className="errors" role="alert">
              {error}
            </p>
          )}
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {mode === 'set' ? 'Turn on lock' : 'Turn off lock'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function LearnedRules() {
  const rules = useLedger((s) => s.rules);
  const categories = useLedger((s) => s.categories);
  const forgetRule = useLedger((s) => s.forgetRule);
  const entries = Object.entries(rules).sort(([a], [b]) => a.localeCompare(b));
  return (
    <section className="card" aria-labelledby="rules-title">
      <h2 id="rules-title">Learned categories</h2>
      {entries.length === 0 ? (
        <p className="muted small">
          When you pick a category for a merchant Ledger did not recognise, it remembers it here.
        </p>
      ) : (
        <ul className="rule-list">
          {entries.map(([key, categoryId]) => (
            <li key={key} className="rule-row">
              <span>{key}</span>
              <span className="muted">{categoryById(categories, categoryId)?.name ?? 'Other'}</span>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Forget ${key}`}
                onClick={() => void forgetRule(key)}
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
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
      <ScreenLock />
      <LearnedRules />
      <Storage />
      <About />
    </>
  );
}
