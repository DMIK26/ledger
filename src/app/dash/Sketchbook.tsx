import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { sketchbookDays } from '../../domain/calendar';
import { categoryById } from '../../domain/categories';
import { fmtDate, monthLabel, todayISO } from '../../domain/dates';
import { artForCategory, Doodle } from '../../doodle/art';
import { useViewMonth } from '../../kit/view';

const REST = { ink: 'M14 40c8-10 28-10 36 0M20 30h6M38 30h6', accent: 'M44 14h8l-8 8h8' };

/**
 * The sketchbook (Drop 11, after Fortune City, in Ledger's doodle style): a page for the month that
 * fills with a drawing of each logged day's biggest category. No-spend days get a resting face.
 */
export function Sketchbook() {
  const transactions = useLedger((s) => s.transactions);
  const noSpendDays = useLedger((s) => s.noSpendDays);
  const categories = useLedger((s) => s.categories);
  const month = useViewMonth();
  const today = todayISO();
  const days = useMemo(
    () => sketchbookDays(month, transactions, noSpendDays, today),
    [month, transactions, noSpendDays, today],
  );
  const drawn = days.filter((d) => d.kind === 'drawn').length;
  return (
    <section
      className="card sketchbook"
      aria-labelledby="sketchbook-title"
      data-testid="sketchbook"
    >
      <div className="card-head">
        <h2 id="sketchbook-title">Sketchbook</h2>
        <span className="muted small">
          {drawn === 1 ? '1 drawing' : `${drawn} drawings`} in {monthLabel(month).split(' ')[0]}
        </span>
      </div>
      <ol className="sketch-page" aria-label={`Drawings for ${monthLabel(month)}`}>
        {days.map((d) => {
          const name =
            d.kind === 'drawn' ? (categoryById(categories, d.categoryId)?.name ?? 'Other') : '';
          return (
            <li
              key={d.date}
              className={`sketch-day sketch-${d.kind}`}
              aria-label={
                d.kind === 'drawn'
                  ? `${fmtDate(d.date)}: ${name}`
                  : d.kind === 'rest'
                    ? `${fmtDate(d.date)}: no spend`
                    : `${fmtDate(d.date)}: ${d.kind === 'future' ? 'still to come' : 'nothing logged'}`
              }
            >
              {/* Drawn by CSS from data-day, so a page of numbers never reads as one long figure. */}
              <span className="sketch-num" data-day={d.day} aria-hidden="true" />
              {d.kind === 'drawn' && <Doodle art={artForCategory(d.categoryId)} size={36} />}
              {d.kind === 'rest' && <Doodle art={REST} size={36} />}
            </li>
          );
        })}
      </ol>
      <p className="muted small">Every day you log adds a drawing of its biggest category.</p>
    </section>
  );
}
