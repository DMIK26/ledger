import { useEffect, useRef, useState } from 'react';
import { EntryForm } from './EntryForm';
import { Icon } from './icons';

/** The Add dialog: centred on desktop, a bottom sheet under 900px. Opened by `?action=add`. */
export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setRound((r) => r + 1);
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet add-sheet"
      aria-labelledby="add-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="sheet-head">
          <h2 id="add-title">Add expense</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {open && <EntryForm key={round} describe autoFocus submitLabel="Save" onDone={onClose} />}
      </div>
    </dialog>
  );
}
