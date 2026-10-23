import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLedger } from '../data/store';
import { fmtWait, resetRemaining } from '../domain/pin';
import { signUnlock } from './passkeyUnlock';
import { tl } from '../domain/i18n';

/** "Forgot PIN?": after a 24-hour wait the PIN is removed and every entry is kept. */
function ForgotPin() {
  const lockReset = useLedger((s) => s.lockReset);
  const requestPinReset = useLedger((s) => s.requestPinReset);
  const applyPinResetIfDue = useLedger((s) => s.applyPinResetIfDue);
  const [asking, setAsking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lockReset === null) return;
    const tick = () => {
      setNow(Date.now());
      void applyPinResetIfDue();
    };
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [lockReset, applyPinResetIfDue]);

  if (lockReset !== null) {
    return (
      <div className="preview" role="status" data-testid="pin-reset-pending">
        <p>
          {tl(
            'PIN reset requested. Ledger will open without a PIN in {0}, with all your entries kept.',
            fmtWait(resetRemaining(lockReset, now)),
          )}
        </p>
        <p className="muted small">{tl('Entering the right PIN before then cancels the reset.')}</p>
      </div>
    );
  }

  if (asking) {
    return (
      <div className="preview">
        <p>
          {tl(
            'Ledger will remove your PIN in 24 hours. Your entries, receipts and settings stay exactly as they are. Open Ledger after that and it will let you in.',
          )}
        </p>
        <p className="muted small">{tl('Entering the right PIN before then cancels the reset.')}</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setNow(Date.now());
              void requestPinReset();
            }}
          >
            {tl('Start the 24-hour wait')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setAsking(false)}>
            {tl('Cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={() => setAsking(true)}>
      {tl('Forgot PIN?')}
    </button>
  );
}

/** Shown instead of the app while locked, so no entry or amount is in the page at all. */
/** With a passkey saved: one tap for Face ID or fingerprint (Drop 13). The PIN still works. */
function PasskeyButton() {
  const passkey = useLedger((s) => s.lockPasskey);
  const unlockWithPasskey = useLedger((s) => s.unlockWithPasskey);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!passkey) return null;
  const run = async () => {
    setBusy(true);
    setFailed(false);
    const assertion = await signUnlock(passkey);
    const ok = assertion !== null && (await unlockWithPasskey(assertion));
    setBusy(false);
    if (!ok) setFailed(true);
  };
  return (
    <>
      <button type="button" className="btn" disabled={busy} onClick={() => void run()}>
        {tl('Use Face ID or fingerprint')}
      </button>
      {failed && (
        <p className="muted small" role="status">
          {tl('That did not unlock Ledger. Try again, or use your PIN.')}
        </p>
      )}
    </>
  );
}

export function LockScreen() {
  const unlock = useLedger((s) => s.unlock);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await unlock(pin);
    setBusy(false);
    if (!ok) {
      setError(tl('That PIN is not right.'));
      setPin('');
      input.current?.focus();
    }
  };

  return (
    <main className="state lock-screen" id="main">
      <form className="lock-form" onSubmit={(e) => void submit(e)}>
        <h1>{tl('Ledger is locked')}</h1>
        <label htmlFor="unlock-pin">{tl('Enter your PIN')}</label>
        <input
          ref={input}
          id="unlock-pin"
          className="input pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ''));
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'unlock-error' : undefined}
        />
        {error && (
          <p id="unlock-error" className="errors" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || pin.length < 4}>
          {tl('Unlock')}
        </button>
        <PasskeyButton />
        <p className="muted small">
          {tl('The lock keeps casual viewers out. It does not encrypt your data.')}
        </p>
      </form>
      <ForgotPin />
    </main>
  );
}
