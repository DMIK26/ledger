import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { validateBackup, type BackupFile } from '../../data/backup';
import { useLedger } from '../../data/store';
import {
  isProtectedBackup,
  openBackup,
  passwordProblem,
  type ProtectedBackup,
} from '../../domain/backupCrypto';
import { fmtDate, todayISO } from '../../domain/dates';
import { backupFile } from '../backupFile';
import { ExportButton } from '../files';
import {
  backUpToFolder,
  canUseFolder,
  chooseFolder,
  folderPermission,
  forgetFolder,
} from '../folderBackup';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

const notABackup = (): string =>
  tl('That file is not a Ledger backup, or it is damaged. Nothing was imported.');
const wrongPassword = (): string =>
  tl(
    'That password does not open this backup. Without the right one nobody can open it, Ledger included.',
  );

/** Settings > Backup: export (optionally with a password), restore, and the weekly folder backup. */
export function BackupCard() {
  const getDb = useLedger((s) => s.getDb);
  const count = useLedger((s) => s.transactions.length);
  const lastBackupAt = useLedger((s) => s.settings.lastBackupAt);
  const importFromBackup = useLedger((s) => s.importFromBackup);
  const restoreBackup = useLedger((s) => s.restoreBackup);
  const setSetting = useLedger((s) => s.setSetting);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [locked, setLocked] = useState<ProtectedBackup | null>(null);
  const [opening, setOpening] = useState('');
  const [busy, setBusy] = useState(false);

  const problem = protect ? passwordProblem(password, again) : null;

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setPending(null);
    setReplacing(false);
    setLocked(null);
    setOpening('');
    setError(null);
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (isProtectedBackup(parsed)) return setLocked(parsed);
      const backup = validateBackup(parsed);
      if (backup) setPending(backup);
      else setError(notABackup());
    } catch {
      setError(notABackup());
    }
  };

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!locked) return;
    setBusy(true);
    setError(null);
    const text = await openBackup(locked, opening);
    setBusy(false);
    if (text === null) return setError(wrongPassword());
    let backup: BackupFile | null;
    try {
      backup = validateBackup(JSON.parse(text));
    } catch {
      backup = null;
    }
    setLocked(null);
    setOpening('');
    if (backup) setPending(backup);
    else setError(notABackup());
  };

  const dates = pending?.data.transactions.map((t) => t.date).sort() ?? [];
  const close = () => {
    setPending(null);
    setReplacing(false);
  };

  return (
    <section className="card" aria-labelledby="data-title">
      <h2 id="data-title">{tl('Backup')}</h2>
      <p className="muted small">
        {tl(
          'Everything lives on this device. A backup is a file you keep somewhere safe and can restore here or on another phone. {0}',
          lastBackupAt > 0
            ? tl('Last backup {0}.', fmtDate(todayISO(new Date(lastBackupAt))))
            : tl('No backup yet.'),
        )}
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={protect}
          onChange={(e) => {
            setProtect(e.target.checked);
            setPassword('');
            setAgain('');
          }}
        />
        {tl('Protect the backup with a password')}
      </label>
      {protect && (
        <>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="backup-password">{tl('Password')}</label>
              <input
                id="backup-password"
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="backup-password-again">{tl('Type it again')}</label>
              <input
                id="backup-password-again"
                className="input"
                type="password"
                autoComplete="new-password"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
              />
            </div>
          </div>
          <p className="muted small" data-testid="password-note">
            {password && problem
              ? `${problem}.`
              : tl(
                  'Ledger never keeps this password. Without it the backup cannot be opened, by you or by Ledger, so write it down somewhere safe.',
                )}
          </p>
        </>
      )}
      <div className="btn-row">
        <ExportButton
          label={protect ? tl('Export protected backup') : tl('Export backup')}
          disabled={count === 0 || problem !== null}
          build={() => backupFile(getDb(), protect ? password : undefined)}
          onDone={() => void setSetting('lastBackupAt', Date.now())}
        />
        <label className="btn">
          {tl('Restore from backup')}
          <input
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(e) => void onFile(e)}
          />
        </label>
      </div>
      {locked && (
        <form className="preview" onSubmit={(e) => void unlock(e)} data-testid="backup-password">
          <p>{tl('This backup is protected with a password.')}</p>
          <div className="field">
            <label htmlFor="open-password">{tl('Its password')}</label>
            <input
              id="open-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy || opening === ''}>
              {busy ? tl('Opening…') : tl('Open backup')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setLocked(null);
                setError(null);
              }}
            >
              {tl('Cancel')}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <div className="preview" data-testid="restore-preview">
          <p>
            {tr(
              'This backup has {0}{1}.',
              pending.data.transactions.length === 1
                ? tl('1 entry')
                : tl('{0} entries', pending.data.transactions.length),
              dates.length > 0 &&
                tl(', {0} to {1}', fmtDate(dates[0]!), fmtDate(dates[dates.length - 1]!)),
            )}
          </p>
          {replacing ? (
            <>
              <p>
                {tl(
                  'Replace everything on this device with the backup? Entries, categories, budgets and recurring payments here are swapped for the backup’s. Theme, privacy and PIN stay as they are. You can undo it straight after.',
                )}
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
                  {tl('Replace everything')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={close}>
                  {tl('Cancel')}
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
                {tl('Add what is missing')}
              </button>
              <button type="button" className="btn" onClick={() => setReplacing(true)}>
                {tl('Replace everything')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={close}>
                {tl('Cancel')}
              </button>
            </div>
          )}
        </div>
      )}
      {canUseFolder() && <FolderBackup />}
    </section>
  );
}

/** Weekly backup to a folder, where the browser can write to one (Drop 13). */
function FolderBackup() {
  const getDb = useLedger((s) => s.getDb);
  const name = useLedger((s) => s.settings.folderBackupName);
  const at = useLedger((s) => s.settings.folderBackupAt);
  const setSetting = useLedger((s) => s.setSetting);
  const [note, setNote] = useState<string | null>(null);
  const [needsAsk, setNeedsAsk] = useState(false);

  useEffect(() => {
    let live = true;
    if (name)
      void folderPermission(getDb()).then((p) => {
        if (live) setNeedsAsk(p === 'prompt');
      });
    return () => {
      live = false;
    };
  }, [getDb, name]);

  const backUp = async (folder: string): Promise<boolean> => {
    const ok = await backUpToFolder(getDb(), true);
    if (ok) {
      const now = Date.now();
      await setSetting('folderBackupAt', now);
      await setSetting('lastBackupAt', now);
      setNeedsAsk(false);
      setNote(tl('Saved this week’s backup in {0}.', folder));
    } else setNote(tl('Ledger could not write to {0}. Choose the folder again.', folder));
    return ok;
  };

  const choose = async () => {
    setNote(null);
    const folder = await chooseFolder(getDb());
    // The first backup goes in straight away; the folder is kept only once that worked.
    if (folder && (await backUp(folder))) await setSetting('folderBackupName', folder);
  };

  const off = async () => {
    await forgetFolder(getDb());
    await setSetting('folderBackupName', '');
    await setSetting('folderBackupAt', 0);
    setNote(null);
  };

  return (
    <div className="folder-backup" data-testid="folder-backup">
      <h3>{tl('Back up to a folder every week')}</h3>
      {name ? (
        <p className="small">
          {tr(
            'Backing up to {0} once a week, when Ledger is open. {1}{2}',
            <strong>{name}</strong>,
            at > 0 ? tl('Last one {0}.', fmtDate(todayISO(new Date(at)))) : '',
            needsAsk && ' ' + tl('The browser wants permission again before the next one.'),
          )}
        </p>
      ) : (
        <p className="muted small">
          {tl(
            'Choose a folder once, such as one your cloud drive keeps in sync. Each week Ledger saves a new backup file there by itself. The files are not protected with a password.',
          )}
        </p>
      )}
      <div className="btn-row">
        {name ? (
          <>
            <button type="button" className="btn" onClick={() => void backUp(name)}>
              {tl('Back up now')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void choose()}>
              {tl('Change folder')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void off()}>
              {tl('Turn off')}
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => void choose()}>
            {tl('Choose a folder')}
          </button>
        )}
      </div>
      {note && (
        <p className="small" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
