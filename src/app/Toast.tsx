import { useEffect } from 'react';
import { useLedger } from '../data/store';
import { applyUpdate, dismissOfflineReady, usePwaState } from '../pwa/register';

export const TOAST_MS = 6000;

export function Toast() {
  const notice = useLedger((s) => s.notice);
  const canUndo = useLedger((s) => s.canUndo);
  const undo = useLedger((s) => s.undo);
  const dismiss = useLedger((s) => s.dismissNotice);
  const pwa = usePwaState();

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismiss, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);

  useEffect(() => {
    if (!pwa.offlineReady) return;
    const timer = window.setTimeout(dismissOfflineReady, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [pwa.offlineReady]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {pwa.updateReady && (
        <div className="toast">
          <p>Update ready</p>
          <button type="button" className="btn" onClick={applyUpdate}>
            Reload
          </button>
        </div>
      )}
      {pwa.offlineReady && (
        <div className="toast">
          <p>Ready to work offline</p>
          <button type="button" className="btn" onClick={dismissOfflineReady}>
            Close
          </button>
        </div>
      )}
      {notice && (
        <div className="toast">
          <p>{notice}</p>
          {canUndo && !notice.startsWith('Undid') && (
            <button type="button" className="btn" onClick={() => void undo()}>
              Undo
            </button>
          )}
          <button type="button" className="btn" onClick={dismiss}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
