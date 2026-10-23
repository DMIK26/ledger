import { SampleCard } from '../SampleData';
import { InstallButton, InstallText } from '../InstallBanner';
import { useEffect, useState, type FormEvent } from 'react';
import { useLedger } from '../../data/store';
import {
  MAX_MONTH_START,
  monthKey,
  monthLabel,
  monthRangeLabel,
  MONTHS,
  monthName,
  todayISO,
} from '../../domain/dates';
import { frequentEntries, MAX_FAVOURITES, repeatKey } from '../../domain/repeat';
import { categoryById } from '../../domain/categories';
import { CURRENCIES } from '../../domain/money';
import { isValidPin } from '../../domain/pin';
import { methodLabel, type ThemeChoice } from '../../domain/types';
import { checkForUpdates, usePwaState } from '../../pwa/register';
import { Money, usePrivacy } from '../Money';
import { href } from '../router';
import { CategoryManager } from '../settings/CategoryManager';
import { CsvImport } from '../settings/CsvImport';
import { Activity } from '../settings/Activity';
import { RulesCard } from '../settings/Rules';
import { SpacesCard } from '../spaces/SpacesCard';
import { BackupCard } from '../settings/BackupCard';
import { PasskeySetting } from '../settings/PasskeySetting';
import { getLanguage, LANGUAGES } from '../../domain/i18n';
import { badgeSupported, needsNotificationsForBadge } from '../appBadge';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

const THEMES: Array<{ value: ThemeChoice; label: string }> = [
  {
    value: 'system',
    get label() {
      return tl('System');
    },
  },
  {
    value: 'light',
    get label() {
      return tl('Light');
    },
  },
  {
    value: 'dark',
    get label() {
      return tl('Dark');
    },
  },
];

function Appearance() {
  const theme = useLedger((s) => s.settings.theme);
  const language = useLedger((s) => s.settings.language);
  const setSetting = useLedger((s) => s.setSetting);
  return (
    <section className="card" aria-labelledby="appearance-title">
      <h2 id="appearance-title">{tl('Appearance')}</h2>
      <div className="segmented" role="group" aria-label={tl('Theme')}>
        {THEMES.map((th) => (
          <button
            key={th.value}
            type="button"
            aria-pressed={theme === th.value}
            onClick={() => void setSetting('theme', th.value)}
          >
            {th.label}
          </button>
        ))}
      </div>
      <div className="field-row">
        <span id="language-label">{tl('Language')}</span>
        <div className="segmented" role="group" aria-labelledby="language-label">
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              type="button"
              lang={l.html}
              aria-pressed={language === l.value}
              data-testid={`language-${l.value}`}
              onClick={() => void setSetting('language', l.value)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">
        {tl(
          'Screens, messages and dates follow the language. Amounts keep Western digits and the rupee sign, and anything not yet translated shows in English.',
        )}
      </p>
    </section>
  );
}

function Experience() {
  const motion = useLedger((s) => s.settings.motion);
  const haptics = useLedger((s) => s.settings.haptics);
  const sounds = useLedger((s) => s.settings.sounds);
  const doodles = useLedger((s) => s.settings.doodles);
  const wryLines = useLedger((s) => s.settings.wryLines);
  const sketchStyle = useLedger((s) => s.settings.sketchStyle);
  const setSetting = useLedger((s) => s.setSetting);
  return (
    <section className="card" aria-labelledby="experience-title">
      <h2 id="experience-title">{tl('Experience')}</h2>
      <div className="field-row">
        <span id="motion-label">{tl('Motion')}</span>
        <div className="segmented" role="group" aria-labelledby="motion-label">
          {(
            [
              ['full', tl('Full')],
              ['reduced', tl('Reduced')],
              ['off', tl('Off')],
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
        {tl('Reduced keeps short fades only. Your device’s reduce-motion setting always wins.')}
      </p>
      <div className="field-row">
        <span id="haptics-label">{tl('Vibrate when a drag snaps')}</span>
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
        <span id="sounds-label">{tl('Click when a drag snaps')}</span>
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
        <span id="doodles-label">{tl('Doodles')}</span>
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
        {tl(
          'The pencil, category drawings, mood faces and handwritten notes on charts. Your own notes and sketches stay either way.',
        )}
      </p>
      <div className="field-row">
        <span id="wry-label">{tl('Wry one-liners')}</span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={wryLines}
          aria-labelledby="wry-label"
          onClick={() => void setSetting('wryLines', !wryLines)}
        />
      </div>
      <p className="muted small">
        {tl(
          'Now and then the pencil says a short, kind, wry line about your month instead of a plain fact. Written into Ledger; nothing goes online.',
        )}
      </p>
      <div className="field-row">
        <span id="sketch-style-label">{tl('Sketch style')}</span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={sketchStyle}
          aria-labelledby="sketch-style-label"
          onClick={() => void setSetting('sketchStyle', !sketchStyle)}
        />
      </div>
      <p className="muted small">
        {tl('Hand-drawn outlines on cards and buttons. Printing stays clean.')}
      </p>
      <BadgeSetting />
    </section>
  );
}

/** Bills due this week on the app icon (Drop 13), only where the device has a badge. */
function BadgeSetting() {
  const on = useLedger((s) => s.settings.appBadge);
  const setSetting = useLedger((s) => s.setSetting);
  const [blocked, setBlocked] = useState(false);
  if (!badgeSupported()) return null;
  const toggle = async () => {
    setBlocked(false);
    if (on) return setSetting('appBadge', false);
    await setSetting('appBadge', true);
    if (needsNotificationsForBadge() && typeof Notification !== 'undefined') {
      const permission =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== 'granted') setBlocked(true);
    }
  };
  return (
    <>
      <div className="field-row">
        <span id="badge-label">{tl('Bills due this week on the app icon')}</span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={on}
          aria-labelledby="badge-label"
          onClick={() => void toggle()}
        />
      </div>
      <p className="muted small">
        {tl(
          'The number of recurring payments and card payments due in the next seven days, updated while Ledger is open. On an iPhone it only shows if notifications are allowed; Ledger asks, and never sends any.',
        )}
      </p>
      {blocked && (
        <p className="small" role="status">
          {tl(
            'Notifications are off for Ledger, so the iPhone will not show the number. Turn them on in Settings, Notifications, Ledger.',
          )}
        </p>
      )}
    </>
  );
}

function Privacy() {
  const privacy = usePrivacy();
  const setSetting = useLedger((s) => s.setSetting);
  return (
    <section className="card" aria-labelledby="privacy-title">
      <div className="field-row">
        <div>
          <h2 id="privacy-title">{tl('Privacy mode')}</h2>
          <p className="muted small">
            {tl('Hides every amount on screen, for when someone is looking over your shoulder.')}
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
        <span className="muted small">{tl('Sample')}</span>
        <Money minor={123456} />
      </p>
    </section>
  );
}

// "1st" in English; Telugu and Hindi say the plain number.
const ordinal = (n: number): string =>
  getLanguage() !== 'en'
    ? String(n)
    : `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

function MoneySettings() {
  const currency = useLedger((s) => s.settings.currency);
  const fyStartMonth = useLedger((s) => s.settings.fyStartMonth);
  const monthStartDay = useLedger((s) => s.settings.monthStartDay);
  const thisMonth = monthKey(todayISO());
  const setSetting = useLedger((s) => s.setSetting);
  return (
    <section className="card" aria-labelledby="money-title">
      <h2 id="money-title">{tl('Money')}</h2>
      <div className="field-row">
        <label htmlFor="currency">{tl('Currency for new entries')}</label>
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
        <label htmlFor="fy-start">{tl('Financial year starts in')}</label>
        <select
          id="fy-start"
          className="select"
          value={fyStartMonth}
          onChange={(e) => void setSetting('fyStartMonth', Number(e.target.value))}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {monthName(i + 1)}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <label htmlFor="month-start">{tl('Months start on the')}</label>
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
          ? tl(
              'Budgets and month totals follow calendar months. Paid on a fixed day? Start months on that day.',
            )
          : tl(
              '{0} runs {1}. A month starting after the 15th is named after the month it ends in.',
              monthLabel(thisMonth),
              monthRangeLabel(thisMonth),
            )}
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
  const name = (id: string) => categoryById(categories, id)?.name ?? tl('Other');
  return (
    <section className="card" aria-labelledby="favourites-title">
      <h2 id="favourites-title">{tl('Favourites')}</h2>
      <p className="muted small">
        {tl(
          'Favourites come first in the Repeat row under quick add; one tap adds them for today. Save one from Transactions too: select an entry, then Save as favourite.',
        )}
      </p>
      {favourites.length > 0 && (
        <ul className="rule-list" aria-label={tl('Your favourites')}>
          {favourites.map((f, i) => (
            <li key={f.id} className="rule-row">
              <span>
                {f.merchant} <Money minor={f.amountMinor} currency={currency} />
              </span>
              <span className="muted">
                {name(f.categoryId)}, {methodLabel(f.method)}
              </span>
              <span className="btn-row">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={tl('Move {0} up', f.merchant)}
                  disabled={i === 0}
                  onClick={() => void moveFavourite(f.id, i - 1)}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={tl('Remove {0} from favourites', f.merchant)}
                  onClick={() => void removeFavourite(f.id)}
                >
                  {tl('Remove')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <>
          <h3 className="small">{tl('Logged often')}</h3>
          <ul className="rule-list" aria-label={tl('Suggested favourites')}>
            {suggestions.map((f) => (
              <li key={f.key} className="rule-row">
                <span>
                  {f.merchant} <Money minor={f.amountMinor} currency={currency} />
                </span>
                <span className="muted">{tr('{0} times in 90 days', f.count)}</span>
                <button
                  type="button"
                  className="btn"
                  disabled={full}
                  aria-label={tl('Save {0} as a favourite', f.merchant)}
                  onClick={() => void saveFavourite(f)}
                >
                  {tl('Save')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {favourites.length === 0 && suggestions.length === 0 && (
        <p className="muted small">
          {tl('Nothing yet. Things you log three times in 90 days show up here.')}
        </p>
      )}
    </section>
  );
}

function Records() {
  const trashCount = useLedger((s) => s.trash.length);
  return (
    <section className="card" aria-labelledby="records-title">
      <h2 id="records-title">{tl('History')}</h2>
      <p className="muted small">
        {tl('Every change is logged, and deleted entries wait in Trash for 30 days.')}
      </p>
      <div className="btn-row">
        <a className="btn" href={href('/settings?view=activity')}>
          {tl('Activity')}
        </a>
        <a className="btn" href={href('/transactions?view=trash')}>
          {trashCount > 0 ? tl('Trash ({0})', trashCount) : tl('Trash')}
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
      if (!isValidPin(pin)) return setError(tl('Use 4 to 8 digits.'));
      if (pin !== again) return setError(tl('The two PINs do not match.'));
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
        setError(tl('That PIN is not right.'));
        setPinText('');
      }
    }
  };

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8);

  return (
    <section className="card" aria-labelledby="lock-title">
      <h2 id="lock-title">{tl('Screen lock')}</h2>
      <p className="muted small">
        {tl(
          'A 4 to 8 digit PIN, asked when Ledger opens and after 30 seconds in the background. It keeps casual viewers out. It does not encrypt your data.',
        )}
      </p>
      <p className="muted small">
        {tl(
          'Forgot it? Tap Forgot PIN on the lock screen. Ledger removes the PIN after 24 hours and keeps every entry. Entering the right PIN before then cancels it.',
        )}
      </p>
      {mode === 'idle' && (
        <div className="btn-row">
          {hasLock ? (
            <>
              <button type="button" className="btn" onClick={lockNow}>
                {tl('Lock now')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setMode('remove')}>
                {tl('Turn off')}
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setMode('set')}>
              {tl('Set a PIN')}
            </button>
          )}
        </div>
      )}
      {mode === 'idle' && hasLock && <PasskeySetting />}
      {mode !== 'idle' && (
        <form className="lock-settings" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="pin-1">{mode === 'set' ? tl('New PIN') : tl('Current PIN')}</label>
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
              <label htmlFor="pin-2">{tl('Repeat the PIN')}</label>
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
              {mode === 'set' ? tl('Turn on lock') : tl('Turn off lock')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              {tl('Cancel')}
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
      <h2 id="rules-title">{tl('Learned categories')}</h2>
      {entries.length === 0 ? (
        <p className="muted small">
          {tl(
            'When you pick a category for a merchant Ledger did not recognise, it remembers it here.',
          )}
        </p>
      ) : (
        <ul className="rule-list">
          {entries.map(([key, categoryId]) => (
            <li key={key} className="rule-row">
              <span>{key}</span>
              <span className="muted">
                {categoryById(categories, categoryId)?.name ?? tl('Other')}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={tl('Forget {0}', key)}
                onClick={() => void forgetRule(key)}
              >
                {tl('Forget')}
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
      <h2 id="storage-title">{tl('Storage')}</h2>
      {!supported ? (
        <p className="muted small">{tl('This browser does not report storage details.')}</p>
      ) : (
        <>
          <p className="muted small">
            {persisted
              ? tl('Protected: the browser will not clear your data to free space.')
              : tl(
                  'Not protected yet: the browser may clear data when the device runs low on space.',
                )}
            {usage && ' ' + tl('Using {0}.', usage)}
          </p>
          {!persisted && (
            <button
              type="button"
              className="btn"
              onClick={() => void navigator.storage.persist().then(setPersisted)}
            >
              {tl('Keep my data')}
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
      <h2 id="about-title">{tl('About')}</h2>
      <p className="muted small">
        {tl(
          'Ledger {0}. {1}',
          __APP_VERSION__,
          pwa.installed ? tl('Installed as an app.') : tl('Running in the browser.'),
        )}
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
              setResult(found ? tl('An update is ready.') : tl('You have the latest version.')),
            )
          }
        >
          {tl('Check for updates')}
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

export function Settings({ view, merchant }: { view?: string | null; merchant?: string | null }) {
  if (view === 'activity') return <Activity />;
  if (view === 'rules')
    return (
      <>
        <p>
          <a href={href('/settings')}>{tl('Back to settings')}</a>
        </p>
        <RulesCard startText={merchant} />
        <LearnedRules />
      </>
    );
  return (
    <>
      <Appearance />
      <Privacy />
      <Experience />
      <MoneySettings />
      <SpacesCard />
      <CategoryManager />
      <Favourites />
      <RulesCard />
      <LearnedRules />
      <BackupCard />
      <SampleCard />
      <CsvImport />
      <Records />
      <ScreenLock />
      <Storage />
      <About />
    </>
  );
}
