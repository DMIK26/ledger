import { useEffect, useRef, useState } from 'react';
import { useLedger } from '../data/store';
import { categoryById } from '../domain/categories';
import { anchorLabel, noteText, STAMPS, STAMP_LABEL, MAX_NOTE_LENGTH } from '../domain/notes';
import { SKETCH_COLORS, type SketchColor } from '../domain/sketch';
import { Icon } from '../app/icons';
import { usePrivacy } from '../app/Money';
import { replaceRoute, useBackClose } from '../pwa/back';
import { useViewMonth } from '../kit/view';
import { artForCategory, Doodle, EMPTY_ART, STAMP_ART } from './art';
import { findAnchor, useDoodle, type SketchToolChoice } from './state';

const PAGE_NAME: Record<string, string> = {
  '/': 'Dashboard',
  '/transactions': 'Transactions',
  '/budgets': 'Budgets',
  '/reports': 'Reports',
  '/recurring': 'Recurring',
  '/settings': 'Settings',
};

const COLOR_NAME: Record<SketchColor, string> = {
  ink: 'Ink',
  clay: 'Clay',
  blue: 'Blue',
  green: 'Green',
};

const TOOLS: [SketchToolChoice, string][] = [
  ['pen', 'Pen'],
  ['highlighter', 'Highlighter'],
  ['eraser', 'Eraser'],
  ['note', 'Note'],
  ['stamp', 'Stamp'],
];

const isTyping = (el: Element | null): boolean =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** D toggles sketch mode, Escape leaves it, Shift+N opens the notes list. */
export function useDoodleKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(document.activeElement)) return;
      const d = useDoodle.getState();
      if (e.key === 'Escape' && d.sketchOn && !e.defaultPrevented) {
        e.preventDefault();
        d.setSketch(false);
        return;
      }
      if (document.querySelector('dialog[open]')) return;
      if ((e.key === 'd' || e.key === 'D') && !e.shiftKey) {
        e.preventDefault();
        d.toggleSketch();
      } else if (e.key === 'N' && e.shiftKey) {
        e.preventDefault();
        d.setNotesOpen(!d.notesOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** The sketch tools, fixed at the bottom of the screen while sketch mode is on. */
export function SketchToolbar({ path }: { path: string }) {
  const sketchOn = useDoodle((s) => s.sketchOn);
  const tool = useDoodle((s) => s.tool);
  const color = useDoodle((s) => s.color);
  const stamp = useDoodle((s) => s.stamp);
  const fade = useDoodle((s) => s.fade);
  const { setTool, setColor, setStamp, setFade, setSketch } = useDoodle.getState();
  const month = useViewMonth();
  const undo = useLedger((s) => s.undo);
  const redo = useLedger((s) => s.redo);
  const canUndo = useLedger((s) => s.canUndo);
  const canRedo = useLedger((s) => s.canRedo);
  const clearSketch = useLedger((s) => s.clearSketch);
  const hasStrokes = useLedger((s) =>
    s.sketches.some((k) => k.page === path && k.month === month && k.strokes.length > 0),
  );
  useBackClose(sketchOn, () => setSketch(false));
  if (!sketchOn) return null;
  return (
    <div
      className="sketch-toolbar"
      role="toolbar"
      aria-label="Sketch tools"
      data-testid="sketch-toolbar"
    >
      <div className="tool-group" role="group" aria-label="Tool">
        {TOOLS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="btn btn-ghost tool"
            aria-pressed={tool === id}
            onClick={() => setTool(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tool === 'stamp' ? (
        <div className="tool-group" role="group" aria-label="Stamp">
          {STAMPS.map((s) => (
            <button
              key={s}
              type="button"
              className="btn btn-ghost btn-icon"
              aria-pressed={stamp === s}
              aria-label={STAMP_LABEL[s]}
              onClick={() => setStamp(s)}
            >
              <Doodle art={STAMP_ART[s]} size={22} />
            </button>
          ))}
        </div>
      ) : (
        <div className="tool-group" role="group" aria-label="Colour">
          {SKETCH_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch swatch-${c}`}
              aria-pressed={color === c}
              aria-label={COLOR_NAME[c]}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      )}
      <div className="tool-group">
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={fade}
          onClick={() => setFade(!fade)}
          title="Strokes fade after three seconds and are not saved"
        >
          Fading ink
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={() => void undo()}
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={() => void redo()}
        >
          <Icon name="redo" />
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!hasStrokes}
          onClick={() => void clearSketch(path, month)}
        >
          Clear
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setSketch(false)}>
          Done
        </button>
      </div>
      <p className="small muted sketch-tip">
        Hold still for a moment to snap to a line, circle or box.
      </p>
    </div>
  );
}

function NoteRow({ id }: { id: string }) {
  const note = useLedger((s) => s.notes.find((n) => n.id === id));
  const categories = useLedger((s) => s.categories);
  const transactions = useLedger((s) => s.transactions);
  const saveNote = useLedger((s) => s.saveNote);
  const deleteNote = useLedger((s) => s.deleteNote);
  const setNotesOpen = useDoodle((s) => s.setNotesOpen);
  const showCaption = useDoodle((s) => s.showCaption);
  const [editing, setEditing] = useState(false);
  usePrivacy();
  if (!note) return null;
  const where = anchorLabel(
    note.anchor,
    categories,
    (txId) => transactions.find((t) => t.id === txId)?.merchant,
  );
  const show = () => {
    replaceRoute(note.page);
    setNotesOpen(false);
    // Point at it once the page has drawn.
    window.setTimeout(() => {
      const el = findAnchor(note.anchor);
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
      showCaption({
        text: note.text ? noteText(note.text) : STAMP_LABEL[note.stamp!],
        anchor: note.anchor,
      });
    }, 120);
  };
  return (
    <li className="note-row">
      {note.stamp && (
        <Doodle art={STAMP_ART[note.stamp]} size={22} title={STAMP_LABEL[note.stamp]} />
      )}
      <div className="note-body">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = String(new FormData(e.currentTarget).get('text') ?? '');
              void saveNote({ ...note, text });
              setEditing(false);
            }}
          >
            <label className="visually-hidden" htmlFor={`note-${note.id}`}>
              Note
            </label>
            <textarea
              id={`note-${note.id}`}
              name="text"
              className="input"
              rows={2}
              maxLength={MAX_NOTE_LENGTH}
              defaultValue={note.text}
              autoFocus
            />
            <div className="btn-row">
              <button type="submit" className="btn btn-primary">
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="note-text-row">
            {note.text ? noteText(note.text) : STAMP_LABEL[note.stamp!]}
          </p>
        )}
        <p className="small muted">
          On {where}, {PAGE_NAME[note.page] ?? 'Dashboard'}
        </p>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={show}>
          Show
        </button>
        {!editing && (
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={`Delete note on ${where}`}
          onClick={() => void deleteNote(note.id)}
        >
          <Icon name="trash" />
        </button>
      </div>
    </li>
  );
}

/** Every note and stamp in one list (Shift+N). */
export function NotesPanel() {
  const open = useDoodle((s) => s.notesOpen);
  const setNotesOpen = useDoodle((s) => s.setNotesOpen);
  const ids = useLedger((s) => s.notes.map((n) => n.id).join(' '));
  const dialog = useRef<HTMLDialogElement>(null);
  useBackClose(open, () => setNotesOpen(false));

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  const list = ids ? ids.split(' ') : [];
  return (
    <dialog
      ref={dialog}
      className="sheet notes-sheet"
      aria-labelledby="notes-title"
      onClose={() => setNotesOpen(false)}
      onClick={(e) => {
        if (e.target === e.currentTarget) setNotesOpen(false);
      }}
    >
      <div className="sheet-body">
        <div className="card-head">
          <h2 id="notes-title">Notes</h2>
          <button type="button" className="btn btn-ghost" onClick={() => setNotesOpen(false)}>
            Close
          </button>
        </div>
        {list.length === 0 ? (
          <p className="muted">
            No notes yet. Press D (or ask the pencil) to sketch, then pick Note or Stamp and tap a
            bar, slice, row, day or budget.
          </p>
        ) : (
          <ul className="notes-list" data-testid="notes-list">
            {list.map((id) => (
              <NoteRow key={id} id={id} />
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}

/** When an entry is saved, its category's drawing draws itself in the corner, then fades. */
export function DoodleBurst() {
  const doodles = useLedger((s) => s.settings.doodles);
  const categories = useLedger((s) => s.categories);
  const [burst, setBurst] = useState<{ id: string; categoryId: string } | null>(null);

  useEffect(() => {
    const known = new Set(useLedger.getState().transactions.map((t) => t.id));
    let timer = 0;
    const unsubscribe = useLedger.subscribe((state, prev) => {
      if (state.transactions === prev.transactions) return;
      const fresh = state.transactions.filter((t) => !known.has(t.id));
      for (const t of fresh) known.add(t.id);
      // One new entry typed or added just now; not imports, restores or undone deletes.
      const t = fresh.length === 1 ? fresh[0]! : null;
      if (!t || (t.source !== 'quick' && t.source !== 'form')) return;
      if (Math.abs(Date.now() - t.createdAt) > 5000) return;
      window.clearTimeout(timer);
      setBurst({ id: t.id, categoryId: t.categoryId });
      timer = window.setTimeout(() => setBurst(null), 2200);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  if (!doodles || !burst) return null;
  const name = categoryById(categories, burst.categoryId)?.name ?? 'Other';
  return (
    <div
      className="doodle-burst doodle-ui"
      aria-hidden="true"
      data-testid="doodle-burst"
      key={burst.id}
    >
      <Doodle art={artForCategory(burst.categoryId)} size={72} draw />
      <span className="burst-caption">{name}</span>
    </div>
  );
}

/** The drawing above an empty state. */
export function EmptyDoodle({ art }: { art: keyof typeof EMPTY_ART }) {
  const doodles = useLedger((s) => s.settings.doodles);
  if (!doodles) return null;
  return <Doodle art={EMPTY_ART[art]!} size={88} draw className="empty-doodle doodle-ui" />;
}
