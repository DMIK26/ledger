import { useEffect, useState } from 'react';
import { useLedger } from '../../data/store';
import { createPasskey, passkeyAvailable } from '../passkeyUnlock';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

/** Settings > Screen lock, with a PIN set: unlock with Face ID or fingerprint (Drop 13). */
export function PasskeySetting() {
  const passkey = useLedger((s) => s.lockPasskey);
  const setLockPasskey = useLedger((s) => s.setLockPasskey);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void passkeyAvailable().then((ok) => {
      if (live) setAvailable(ok);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!available && !passkey) return null;

  const toggle = async (on: boolean) => {
    setError(null);
    if (!on) return setLockPasskey(null);
    setBusy(true);
    const made = await createPasskey();
    setBusy(false);
    if (made) await setLockPasskey(made);
    else setError(tl('This device did not make a passkey, so the PIN stays the only way in.'));
  };

  return (
    <div className="passkey-setting" data-testid="passkey-setting">
      <label className="check">
        <input
          type="checkbox"
          checked={passkey !== null}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        {tl('Unlock with Face ID or fingerprint')}
      </label>
      <p className="muted small">
        {tr(
          'Uses a passkey made on this device. The PIN always still works. Not yet tried on a real iPhone home-screen app.{0}',
          passkey &&
            ' ' +
              tl(
                'Turning this off leaves the passkey in the device’s passwords list, where you can delete it.',
              ),
        )}
      </p>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
