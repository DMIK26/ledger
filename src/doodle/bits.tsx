import { useEffect, useState } from 'react';
import { useLedger } from '../data/store';
import { categoryById } from '../domain/categories';
import { tl } from '../domain/i18n';
import { artForCategory, Doodle, EMPTY_ART } from './art';
import { useDoodle } from './state';

/**
 * The small, always-there parts of the doodles: the keyboard shortcuts, the drawing after a save and
 * the drawing above an empty state. The sketch tools and the notes list load on first use (Drop 13).
 */

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
  const name = categoryById(categories, burst.categoryId)?.name ?? tl('Other');
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
