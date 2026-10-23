import { useEffect } from 'react';
import { isUndidNotice, useLedger } from '../data/store';
import { applyUpdate, dismissOfflineReady, usePwaState } from '../pwa/register';
import { tl } from '../domain/i18n';

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
          <p>{tl('Update ready')}</p>
          <button type="button" className="btn" onClick={applyUpdate}>
            {tl('Reload')}
          </button>
        </div>
      )}
      {pwa.offlineReady && (
        <div className="toast">
          <p>{tl('Ready to work offline')}</p>
          <button type="button" className="btn" onClick={dismissOfflineReady}>
            {tl('Close')}
          </button>
        </div>
      )}
      {notice && (
        <div className="toast">
          <p>{notice}</p>
          {canUndo && !isUndidNotice(notice) && (
            <button type="button" className="btn" onClick={() => void undo()}>
              {tl('Undo')}
            </button>
          )}
          <button type="button" className="btn" onClick={dismiss}>
            {tl('Close')}
          </button>
        </div>
      )}
    </div>
  );
}
