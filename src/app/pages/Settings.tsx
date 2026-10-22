import { SampleCard } from '../SampleData';
import { InstallButton, InstallText } from '../InstallBanner';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { exportBackup, validateBackup, type BackupFile } from '../../data/backup';
import { useLedger } from '../../data/store';
import {
  fmtDate,
  MAX_MONTH_START,
  monthKey,
  monthLabel,
  monthRangeLabel,
  MONTHS,
  todayISO,
} from '../../domain/dates';
import { frequentEntries, MAX_FAVOURITES, repeatKey } from '../../domain/repeat';
import { categoryById } from '../../domain/categories';
import { CURRENCIES } from '../../domain/money';
import { isValidPin } from '../../domain/pin';
import type { ThemeChoice } from '../../domain/types';
import { checkForUpdates, usePwaState } from '../../pwa/register';
import { Money, usePrivacy } from '../Money';
import { ExportButton } from '../files';
import { href } from '../router';
import { CategoryManager } from '../settings/CategoryManager';
import { CsvImport } from '../settings/CsvImport';
import { Activity } from '../settings/Activity';

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

function Experience() {
  const motion = useLedger((s) => s.settings.motion);
  const haptics = useLedger((s) => s.settings.haptics);
  const sounds = useLedger((s) => s.settings.sounds);
  const doodles = useLedger((s) => s.settings.doodles);
  const sketchStyle = useLedger((s) => s.settings.sketchStyle);
  const setSetting = useLedger((s) => s.setSetting);
  return (
    <section className="card" aria-labelledby="experience-title">
      <h2 id="experience-title">Experience</h2>
      <div className="field-row">
        <span id="motion-label">Motion</span>
        <div className="segmented" role="group" aria-labelledby="motion-label">
          {(
            [
              ['full', 'Full'],
              ['reduced', 'Reduced'],
              ['off', 'Off'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={motion === value}
              onClick={() => void setSetting('motion', value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">
        Reduced keeps short fades only. Your device&rsquo;s reduce-motion setting always wins.
      </p>
      <div className="field-row">
        <span id="haptics-label">Vibrate when a drag snaps</span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={haptics}
          aria-labelledby="haptics-label"
          onClick={() => void setSetting('haptics', !haptics)}
        />
      </div>
      <div className="field-row">
        <span id="sounds-label">Click when a drag snaps</span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={sounds}
          aria-labelledby="sounds-label"
          onClick={() => void setSetting('sounds', !sounds)}
        />
      </div>
      <div className="field-row">
        <span id="doodles-label">Doodles</span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={doodles}
          aria-labelledby="doodles-label"
          onClick={() => void setSetting('doodles', !doodles)}
        />
      </div>
      <p className="muted small">
        The pencil, category drawings, mood faces and handwritten notes on charts. Your own notes
        and sketches stay either way.
      </p>
      <div className="field-row">
        <span id="sketch-style-label">Sketch style</span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={sketchStyle}
          aria-labelledby="sketch-style-label"
          onClick={() => void setSetting('sketchStyle', !sketchStyle)}
        />
      </div>
      <p className="muted small">Hand-drawn outlines on cards and buttons. Printing stays clean.</p>
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

const ordinal = (n: number): string =>
  `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

function MoneySettings() {
  const currency = useLedger((s) => s.settings.currency);
  const fyStartMonth = useLedger((s) => s.settings.fyStartMonth);
  const monthStartDay = useLedger((s) => s.settings.monthStartDay);
  const thisMonth = monthKey(todayISO());
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
      <div className="field-row">
        <label htmlFor="month-start">Months start on the</label>
        <select
          id="month-start"
          className="select"
          aria-describedby="month-start-help"
          value={monthStartDay}
          onChange={(e) => void setSetting('monthStartDay', Number(e.target.value))}
        >
          {Array.from({ length: MAX_MONTH_START }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {ordinal(d)}
            </option>
          ))}
        </select>
      </div>
      <p className="muted small" id="month-start-help" data-testid="month-start-help">
        {monthStartDay === 1
          ? 'Budgets and month totals follow calendar months. Paid on a fixed day? Start months on that day.'
          : `${monthLabel(thisMonth)} runs ${monthRangeLabel(thisMonth)}. A month starting after the 15th is named after the month it ends in.`}
      </p>
    </section>
  );
}

/** Pinned entries for the Repeat chips under quick add, plus suggestions from what is logged often. */
function Favourites() {
  const favourites = useLedger((s) => s.favourites);
  const transactions = useLedger((s) => s.transactions);
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const saveFavourite = useLedger((s) => s.saveFavourite);
  const removeFavourite = useLedger((s) => s.removeFavourite);
  const moveFavourite = useLedger((s) => s.moveFavourite);
  usePrivacy();
  const pinned = new Set(favourites.map((f) => repeatKey(f)));
  const suggestions = frequentEntries(transactions, todayISO())
    .filter((f) => !pinned.has(f.key))
    .slice(0, 5);
  const full = favourites.length >= MAX_FAVOURITES;
  const name = (id: string) => categoryById(categories, id)?.name ?? 'Other';
  return (
    <section className="card" aria-labelledby="favourites-title">
      <h2 id="favourites-title">Favourites</h2>
      <p className="muted small">
        Favourites come first in the Repeat row under quick add; one tap adds them for today. Save
        one from Transactions too: select an entry, then Save as favourite.
      </p>
      {favourites.length > 0 && (
        <ul className="rule-list" aria-label="Your favourites">
          {favourites.map((f, i) => (
            <li key={f.id} className="rule-row">
              <span>
                {f.merchant} <Money minor={f.amountMinor} currency={currency} />
              </span>
              <span className="muted">
                {name(f.categoryId)}, {f.method}
              </span>
              <span className="btn-row">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Move ${f.merchant} up`}
                  disabled={i === 0}
                  onClick={() => void moveFavourite(f.id, i - 1)}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={`Remove ${f.merchant} from favourites`}
                  onClick={() => void removeFavourite(f.id)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <>
          <h3 className="small">Logged often</h3>
          <ul className="rule-list" aria-label="Suggested favourites">
            {suggestions.map((f) => (
              <li key={f.key} className="rule-row">
                <span>
                  {f.merchant} <Money minor={f.amountMinor} currency={currency} />
                </span>
                <span className="muted">{f.count} times in 90 days</span>
                <button
                  type="button"
                  className="btn"
                  disabled={full}
                  aria-label={`Save ${f.merchant} as a favourite`}
                  onClick={() => void saveFavourite(f)}
                >
                  Save
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {favourites.length === 0 && suggestions.length === 0 && (
        <p className="muted small">Nothing yet. Things you log three times in 90 days show up here.</p>
      )}
    </section>
  );
}

function Data() {
  const getDb = useLedger((s) => s.getDb);
  const count = useLedger((s) => s.transactions.length);
  const lastBackupAt = useLedger((s) => s.settings.lastBackupAt);
  const importFromBackup = useLedger((s) => s.importFromBackup);
  const restoreBackup = useLedger((s) => s.restoreBackup);
  const setSetting = useLedger((s) => s.setSetting);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setPending(null);
    setReplacing(false);
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
  const close = () => {
    setPending(null);
    setReplacing(false);
  };

  return (
    <section className="card" aria-labelledby="data-title">
      <h2 id="data-title">Backup</h2>
      <p className="muted small">
        Everything lives on this device. A backup is a file you keep somewhere safe and can restore
        here or on another phone.{' '}
        {lastBackupAt > 0
          ? `Last backup ${fmtDate(todayISO(new Date(lastBackupAt)))}.`
          : 'No backup yet.'}
      </p>
      <div className="btn-row">
        <ExportButton
          label="Export backup"
          disabled={count === 0}
          build={async () =>
            new File(
              [JSON.stringify(await exportBackup(getDb()), null, 2)],
              `ledger-backup-${todayISO()}.json`,
              { type: 'application/json' },
            )
          }
          onDone={() => void setSetting('lastBackupAt', Date.now())}
        />
        <label className="btn">
          Restore from backup
          <input
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(e) => void onFile(e)}
          />
        </label>
      </div>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <div className="preview" data-testid="restore-preview">
          <p>
            This backup has{' '}
            {pending.data.transactions.length === 1
              ? '1 entry'
              : `${pending.data.transactions.length} entries`}
            {dates.length > 0 && `, ${fmtDate(dates[0]!)} to ${fmtDate(dates[dates.length - 1]!)}`}.
          </p>
          {replacing ? (
            <>
              <p>
                Replace everything on this device with the backup? Entries, categories, budgets and
                recurring payments here are swapped for the backup&rsquo;s. Theme, privacy and PIN
                stay as they are. You can undo it straight after.
              </p>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const file = pending;
                    close();
                    void restoreBackup(file);
                  }}
                >
                  Replace everything
                </button>
                <button type="button" className="btn btn-ghost" onClick={close}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const file = pending;
                  close();
                  void importFromBackup(file);
                }}
              >
                Add what is missing
              </button>
              <button type="button" className="btn" onClick={() => setReplacing(true)}>
                Replace everything
              </button>
              <button type="button" className="btn btn-ghost" onClick={close}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Records() {
  const trashCount = useLedger((s) => s.trash.length);
  return (
    <section className="card" aria-labelledby="records-title">
      <h2 id="records-title">History</h2>
      <p className="muted small">
        Every change is logged, and deleted entries wait in Trash for 30 days.
      </p>
      <div className="btn-row">
        <a className="btn" href={href('/settings?view=activity')}>
          Activity
        </a>
        <a className="btn" href={href('/transactions?view=trash')}>
          {trashCount > 0 ? `Trash (${trashCount})` : 'Trash'}
        </a>
      </div>
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
      <InstallText />
      <div className="btn-row">
        <InstallButton />
      </div>
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

export function Settings({ view }: { view?: string | null }) {
  if (view === 'activity') return <Activity />;
  return (
    <>
      <Appearance />
      <Privacy />
      <Experience />
      <MoneySettings />
      <CategoryManager />
      <Favourites />
      <LearnedRules />
      <Data />
      <SampleCard />
      <CsvImport />
      <Records />
      <ScreenLock />
      <Storage />
      <About />
    </>
  );
}
