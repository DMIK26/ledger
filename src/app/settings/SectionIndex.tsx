import { useEffect, useRef, useState } from 'react';
import { tl } from '../../domain/i18n';

/**
 * A row of the Settings sections at the top of the page, each scrolling to its card (Drop 14). It reads
 * the cards' own headings, so names stay translated and cards that are not shown are left out.
 */
export function SectionIndex() {
  const nav = useRef<HTMLElement>(null);
  const [sections, setSections] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    const page = nav.current?.parentElement;
    if (!page) return;
    const read = () =>
      setSections(
        [...page.querySelectorAll<HTMLElement>(':scope > section')]
          .map((card) => card.querySelector<HTMLElement>('h2[id]'))
          .filter((h): h is HTMLElement => h !== null)
          .map((h) => ({ id: h.id, label: h.textContent ?? '' })),
      );
    read();
    const watch = new MutationObserver(read);
    watch.observe(page, { childList: true });
    return () => watch.disconnect();
  }, []);

  return (
    <nav className="section-index" aria-label={tl('Jump to a section')} ref={nav}>
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className="section-link"
          onClick={() => {
            const heading = document.getElementById(s.id);
            heading?.closest('section')?.scrollIntoView({ block: 'start' });
            // Keyboard and screen reader users continue from the section they chose.
            heading?.setAttribute('tabindex', '-1');
            heading?.focus({ preventScroll: true });
          }}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
