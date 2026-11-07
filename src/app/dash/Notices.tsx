import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tl } from '../../domain/i18n';

/**
 * The Dashboard's time-limited notes (check-in, closing the month, backup, recap, sample, install)
 * stacked so only the first shows (Drop 14). Each note decides for itself whether it renders, so the
 * stack counts what actually reached the page.
 */
export function Notices({ children }: { children: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const update = () => setCount(el.childElementCount);
    update();
    const watch = new MutationObserver(update);
    watch.observe(el, { childList: true });
    return () => watch.disconnect();
  }, []);

  const more = count - 1;
  return (
    <div className="notices" data-open={open || undefined}>
      <div className="notices-list" id="notices-list" ref={list}>
        {children}
      </div>
      {more > 0 && (
        <button
          type="button"
          className="btn btn-ghost notices-more"
          aria-expanded={open}
          aria-controls="notices-list"
          onClick={() => setOpen((o) => !o)}
        >
          {open
            ? tl('Show fewer notes')
            : more === 1
              ? tl('1 more note')
              : tl('{0} more notes', more)}
        </button>
      )}
    </div>
  );
}
