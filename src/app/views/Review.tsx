import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useLedger } from '../../data/store';
import { categoryById } from '../../domain/categories';
import { fmtDate } from '../../domain/dates';
import { Money } from '../Money';
import { href } from '../router';

const SWIPE = 80;

/**
 * Transactions > Review (Drop 11, after YNAB's Card Mode): unsure entries one at a time. Accept with the
 * right arrow or a swipe right, skip with the left arrow or a swipe left, or pick a category (1 to 9).
 * Every decision can be undone.
 */
export function ReviewView() {
  const transactions = useLedger((s) => s.transactions);
  const categories = useLedger((s) => s.categories);
  const reviewEntry = useLedger((s) => s.reviewEntry);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const unsure = useMemo(() => transactions.filter((t) => t.unsure), [transactions]);
  const queue = unsure.filter((t) => !skipped.includes(t.id));
  const tx = queue[0];
  const open = categories.filter((c) => !c.archived);
  const quick = open.slice(0, 9);

  useEffect(() => {
    card.current?.focus();
  }, [tx?.id]);

  if (!tx) {
    return (
      <section className="card empty" data-testid="review-done">
        <h2>{unsure.length === 0 ? 'Nothing to review' : 'You have been through them all'}</h2>
        <p className="muted">
          {unsure.length === 0
            ? 'Entries whose category was a guess show up here.'
            : `${skipped.length === 1 ? '1 entry was' : `${skipped.length} entries were`} skipped for now.`}
        </p>
        <p className="btn-row">
          {skipped.length > 0 && (
            <button type="button" className="btn" onClick={() => setSkipped([])}>
              Go through skipped ones
            </button>
          )}
          <a className="btn btn-ghost" href={href('/transactions')}>
            Back to the list
          </a>
        </p>
      </section>
    );
  }

  const category = categoryById(categories, tx.categoryId);
  const accept = () => void reviewEntry(tx.id);
  const skip = () => setSkipped((s) => [...s, tx.id]);
  const choose = (id: string) => void reviewEntry(tx.id, id);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      accept();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      skip();
    } else if (/^[1-9]$/.test(e.key)) {
      const c = quick[Number(e.key) - 1];
      if (c) {
        e.preventDefault();
        choose(c.id);
      }
    }
  };

  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    const moved = e.clientX - start.current;
    start.current = null;
    setDx(0);
    if (moved >= SWIPE) accept();
    else if (moved <= -SWIPE) skip();
  };

  return (
    <section className="card review" aria-labelledby="review-title">
      <div className="card-head">
        <h2 id="review-title">Review</h2>
        <span className="muted small" data-testid="review-left">
          {queue.length === 1 ? '1 to go' : `${queue.length} to go`}
        </span>
      </div>
      <div
        ref={card}
        className="review-card"
        tabIndex={0}
        data-testid="review-card"
        aria-describedby="review-help"
        aria-label={`${tx.merchant || 'Untitled'}, ${fmtDate(tx.date)}, guessed ${category?.name ?? 'Other'}`}
        style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 40}deg)` } : undefined}
        data-lean={dx >= SWIPE ? 'accept' : dx <= -SWIPE ? 'skip' : undefined}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          start.current = e.clientX;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current !== null) setDx(e.clientX - start.current);
        }}
        onPointerUp={end}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
      >
        <p className="review-merchant">{tx.merchant || 'Untitled'}</p>
        <p className="review-amount">
          <Money minor={tx.amountMinor} currency={tx.currency} />
        </p>
        <p className="muted small">
          {fmtDate(tx.date)} · {tx.method}
        </p>
        <p>
          Guessed:{' '}
          <span className="chip">
            <span className="dot" style={{ background: category?.color ?? 'var(--faint)' }} />
            {category?.name ?? 'Other'}
          </span>
        </p>
      </div>
      <p id="review-help" className="muted small">
        Right arrow or swipe right accepts; left arrow or swipe left skips; 1 to 9 picks a category.
      </p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={skip}>
          Skip
        </button>
        <button type="button" className="btn btn-primary" onClick={accept}>
          Accept {category?.name ?? 'Other'}
        </button>
      </div>
      <fieldset className="review-cats">
        <legend className="small">Or move it to</legend>
        {open.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className="chip"
            aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
            disabled={c.id === tx.categoryId}
            onClick={() => choose(c.id)}
          >
            <span className="dot" style={{ background: c.color }} />
            {i < 9 && <span className="review-key">{i + 1}</span>}
            {c.name}
          </button>
        ))}
      </fieldset>
    </section>
  );
}
