import { Suspense, useEffect, useRef, useState } from 'react';
import { useSheetSnap } from '../kit/sheet';
import { useLedger } from '../data/store';
import type { AddMode } from '../domain/types';
import { EntryForm, Keypad, Several } from './deferred';
import { Icon } from './icons';

const MODES: Array<{ id: AddMode; label: string }> = [
  { id: 'form', label: 'Form' },
  { id: 'keypad', label: 'Keypad' },
  { id: 'several', label: 'Several' },
];

/**
 * The Add dialog: centred on desktop, a bottom sheet under 900px. Opened by `?action=add` (with
 * `&on=YYYY-MM-DD` to start on a date). Three ways in: the full form, the keypad, several lines.
 * The last one used is remembered.
 */
export function AddSheet({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [round, setRound] = useState(0);
  const mode = useLedger((s) => s.settings.addMode);
  const setSetting = useLedger((s) => s.setSetting);
  const snap = useSheetSnap(open, onClose);

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
      data-snap={snap.snap}
      style={snap.style}
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
        <div {...snap.handleProps} />
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
        <div className="segmented add-modes" role="group" aria-label="Add with">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => void setSetting('addMode', m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <Suspense
          fallback={
            <p className="muted small" aria-busy="true">
              Opening…
            </p>
          }
        >
          {open && mode === 'form' && (
            <EntryForm
              key={round}
              describe
              autoFocus
              initialDate={date}
              submitLabel="Save"
              onDone={onClose}
            />
          )}
          {open && mode === 'keypad' && <Keypad key={round} initialDate={date} onDone={onClose} />}
          {open && mode === 'several' && (
            <Several key={round} initialDate={date} onDone={onClose} />
          )}
        </Suspense>
      </div>
    </dialog>
  );
}
