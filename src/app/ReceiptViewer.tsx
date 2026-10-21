import { useEffect, useRef, useState } from 'react';
import { useLedger } from '../data/store';
import { fmtDate } from '../domain/dates';
import { Icon } from './icons';
import { usePrivacy } from './Money';
import { useObjectUrl } from './receiptImage';

/** Shows a stored receipt. Blurred while privacy mode is on, because receipts show amounts. */
export function ReceiptViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const getReceipt = useLedger((s) => s.getReceipt);
  const tx = useLedger((s) => s.transactions.find((t) => t.id === id));
  const masked = usePrivacy();
  const [loaded, setLoaded] = useState<{ id: string; blob: Blob | null } | null>(null);
  const url = useObjectUrl(loaded && loaded.id === id ? loaded.blob : null);

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
            {tx ? `Receipt: ${tx.merchant}, ${fmtDate(tx.date)}` : 'Receipt'}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {url ? (
          <img
            className="receipt-full"
            src={url}
            alt={tx ? `Receipt for ${tx.merchant}` : 'Receipt'}
            data-masked={masked ? '' : undefined}
          />
        ) : (
          <p className="muted">No receipt stored for this entry.</p>
        )}
      </div>
    </dialog>
  );
}
