import { useBackClose } from '../pwa/back';
import { useEffect, useRef, useState } from 'react';
import { useLedger } from '../data/store';
import { fmtDate } from '../domain/dates';
import { Icon } from './icons';
import { usePrivacy } from './Money';
import { useObjectUrl } from './receiptImage';
import { tl } from '../domain/i18n';

/** Shows a stored receipt. Blurred while privacy mode is on, because receipts show amounts. */
export function ReceiptViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const getReceipt = useLedger((s) => s.getReceipt);
  const tx = useLedger((s) => s.transactions.find((t) => t.id === id));
  const masked = usePrivacy();
  const [loaded, setLoaded] = useState<{ id: string; blob: Blob | null } | null>(null);
  const url = useObjectUrl(loaded && loaded.id === id ? loaded.blob : null);
  useBackClose(id !== null, onClose);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    let live = true;
    if (id) {
      void getReceipt(id).then((b) => {
        if (live) setLoaded({ id, blob: b ?? null });
      });
      if (!d.open) d.showModal?.();
    } else if (d.open) {
      d.close?.();
    }
    return () => {
      live = false;
    };
  }, [id, getReceipt]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="receipt-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="sheet-head">
          <h2 id="receipt-title">
            {tx ? tl('Receipt: {0}, {1}', tx.merchant, fmtDate(tx.date)) : tl('Receipt')}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label={tl('Close')}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {url ? (
          <img
            className="receipt-full"
            src={url}
            alt={tx ? tl('Receipt for {0}', tx.merchant) : tl('Receipt')}
            data-masked={masked ? '' : undefined}
          />
        ) : (
          <p className="muted">{tl('No receipt stored for this entry.')}</p>
        )}
      </div>
    </dialog>
  );
}
