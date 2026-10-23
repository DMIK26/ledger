import { useMemo, useState } from 'react';
import { useLedger } from '../../data/store';
import { budgetStatus } from '../../domain/budgets';
import { categoryById } from '../../domain/categories';
import { monthLabel } from '../../domain/dates';
import { MAX_NOTE_LENGTH } from '../../domain/notes';
import { monthReview, monthToClose } from '../../domain/plan';
import { Money } from '../Money';
import { href } from '../router';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

/**
 * Close the month (Drop 10): in the first 7 days of a month, a short look back at the last one with an
 * optional note. "Close" puts it away (undoable); "Not now" only hides it until the next visit.
 */
export function MonthCloseCard({ today }: { today: string }) {
  const transactions = useLedger((s) => s.transactions);
  const flows = useLedger((s) => s.flows);
  const budgets = useLedger((s) => s.budgets);
  const categories = useLedger((s) => s.categories);
  const closed = useLedger((s) => s.closedMonths);
  const currency = useLedger((s) => s.settings.currency);
  const closeMonth = useLedger((s) => s.closeMonth);
  const [note, setNote] = useState('');
  const [hidden, setHidden] = useState(false);
  const month = monthToClose(today, closed, transactions);
  const review = useMemo(
    () => (month ? monthReview({ transactions, flows, budgets, categories, month }) : null),
    [month, transactions, flows, budgets, categories],
  );
  if (!month || !review || hidden) return null;
  const label = monthLabel(month);
  const name = label.split(' ')[0];
  const top = review.top ? categoryById(categories, review.top.categoryId) : undefined;
  const status =
    review.budgetMinor !== null ? budgetStatus(review.spentMinor, review.budgetMinor) : null;

  return (
    <section className="card month-close" aria-labelledby="close-title" data-testid="month-close">
      <div className="card-head">
        <h2 id="close-title">{tl('Close {0}', label)}</h2>
        <span className="muted small">{tl('A minute to look back')}</span>
      </div>
      <dl className="card-facts">
        <div>
          <dt>{tl('Spent')}</dt>
          <dd data-testid="close-spent">
            <Money minor={review.spentMinor} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>{tl('Against budget')}</dt>
          <dd>
            {status === null ? (
              tl('No budget')
            ) : status.kind === 'over' ? (
              <span className="status-over">
                {tr('Over by {0}', <Money minor={status.overMinor} currency={currency} />)}
              </span>
            ) : (
              <>{tr('{0} under', <Money minor={status.leftMinor} currency={currency} />)}</>
            )}
          </dd>
        </div>
        <div>
          <dt>{tl('In and out')}</dt>
          <dd>
            {tr(
              '{0} in, {1} out',
              <Money minor={review.inMinor} currency={currency} />,
              <Money minor={review.outMinor} currency={currency} />,
            )}
          </dd>
        </div>
        <div>
          <dt>{tl('Top category')}</dt>
          <dd>
            {top ? top.name : tl('None')}
            {review.top && (
              <>
                , <Money minor={review.top.totalMinor} currency={currency} />
              </>
            )}
          </dd>
        </div>
      </dl>
      <p className="muted small">
        {review.entries === 1 ? tl('1 entry') : tl('{0} entries', review.entries)}
        {review.changePct !== null &&
          (review.changePct === 0
            ? tl(', the same as the month before')
            : tl(
                ', {0}% {1} than the month before',
                Math.abs(review.changePct),
                review.changePct > 0 ? tl('more') : tl('less'),
              ))}
        .
        {review.carriedMinor !== 0 && (
          <>
            {' '}
            {tr(
              'Rollover carries {0} into this month.',
              <Money minor={review.carriedMinor} currency={currency} signed />,
            )}
          </>
        )}
      </p>
      <div className="field">
        <label htmlFor="close-note">{tr('A note for {0} (optional)', name)}</label>
        <textarea
          id="close-note"
          className="input"
          rows={2}
          maxLength={MAX_NOTE_LENGTH}
          placeholder={tl('What went well, what to change')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void closeMonth(month, note)}
        >
          {tr('Close {0}', name)}
        </button>
        <a className="btn btn-ghost" href={href('/budgets')}>
          {tl('Plan this month')}
        </a>
        <button type="button" className="btn btn-ghost" onClick={() => setHidden(true)}>
          {tl('Not now')}
        </button>
      </div>
    </section>
  );
}
