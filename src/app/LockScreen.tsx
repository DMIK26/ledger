import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLedger } from '../data/store';

/** Shown instead of the app while locked, so no entry or amount is in the page at all. */
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
      setError('That PIN is not right.');
      setPin('');
      input.current?.focus();
    }
  };

  return (
    <main className="state" id="main">
      <form className="lock-form" onSubmit={(e) => void submit(e)}>
        <h1>Ledger is locked</h1>
        <label htmlFor="unlock-pin">Enter your PIN</label>
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
          Unlock
        </button>
        <p className="muted small">
          The lock keeps casual viewers out. It does not encrypt your data.
        </p>
      </form>
    </main>
  );
}
