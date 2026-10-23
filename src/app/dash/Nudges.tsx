import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { fmtDate, todayISO } from '../../domain/dates';
import { findNudges, type Nudge } from '../../domain/nudges';
import { Money } from '../Money';
import { href } from '../router';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

const SHOWN = 4;

function NudgeRow({ n }: { n: Nudge }) {
  const currency = useLedger((s) => s.settings.currency);
  const dismissNudge = useLedger((s) => s.dismissNudge);
  const removeTransaction = useLedger((s) => s.removeTransaction);
  const saveRecurring = useLedger((s) => s.saveRecurring);
  const m = (minor: number) => <Money minor={minor} currency={currency} />;
  const fine = (label = tl('Fine')) => (
    <button type="button" className="btn btn-ghost" onClick={() => void dismissNudge(n.id)}>
      {label}
    </button>
  );
  let text: React.ReactNode;
  let actions: React.ReactNode;
  if (n.kind === 'duplicate') {
    const same = n.first.date === n.second.date;
    text = (
      <>
        {tr(
          'Two entries of {0} at {1} {2}. One may be a repeat.',
          m(n.second.amountMinor),
          n.second.merchant || tl('Untitled'),
          same
            ? tl('on {0}', fmtDate(n.second.date))
            : tl('on {0} and {1}', fmtDate(n.first.date), fmtDate(n.second.date)),
        )}
      </>
    );
    actions = (
      <>
        <button type="button" className="btn" onClick={() => void removeTransaction(n.second.id)}>
          {tl('Delete the later one')}
        </button>
        {fine(tl('Both are right'))}
      </>
    );
  } else if (n.kind === 'unusual') {
    text = (
      <>
        {tr(
          '{0} at {1} on {2} is about {3} times your usual {4}.',
          m(n.tx.amountMinor),
          n.tx.merchant,
          fmtDate(n.tx.date),
          n.times,
          m(n.usualMinor),
        )}
      </>
    );
    actions = (
      <>
        <a className="btn" href={href(`/merchant?key=${encodeURIComponent(n.merchantKey)}`)}>
          {tl('See {0}', n.tx.merchant)}
        </a>
        {fine()}
      </>
    );
  } else if (n.kind === 'price') {
    text = (
      <>
        {tr(
          '{0} went up from {1} to {2}, {3} more a year.',
          n.item.merchant,
          m(n.fromMinor),
          m(n.toMinor),
          m(n.yearlyMinor),
        )}
      </>
    );
    actions = (
      <>
        {n.item.amountMinor !== n.toMinor && (
          <button
            type="button"
            className="btn"
            onClick={() =>
              void saveRecurring(
                { ...n.item, amountMinor: n.toMinor },
                tl('Updated {0} to the new price', n.item.merchant),
              ).then(() => dismissNudge(n.id))
            }
          >
            {tl('Update the recurring amount')}
          </button>
        )}
        {fine()}
      </>
    );
  } else {
    text = (
      <>
        {tl(
          'The warranty for {0} ends on {1}{2}.',
          n.tx.merchant || tl('an entry'),
          fmtDate(n.ends),
          n.daysLeft === 0
            ? tl(', today')
            : n.daysLeft === 1
              ? tl(', tomorrow')
              : tl(', in {0} days', n.daysLeft),
        )}
      </>
    );
    actions = (
      <>
        <a className="btn" href={href('/transactions?view=warranties')}>
          {tl('See warranties')}
        </a>
        {fine()}
      </>
    );
  }
  return (
    <li className="nudge" data-testid={`nudge-${n.kind}`}>
      <p className="small">{text}</p>
      <div className="btn-row">{actions}</div>
    </li>
  );
}

/**
 * Worth a look (Drop 12): an unusual amount, a likely repeat, a subscription price rise, a warranty
 * ending. In the app only; each can be put away for good.
 */
export function Nudges() {
  const transactions = useLedger((s) => s.transactions);
  const recurring = useLedger((s) => s.recurring);
  const dismissed = useLedger((s) => s.nudgesDismissed);
  const today = todayISO();
  const nudges = useMemo(
    () => findNudges({ transactions, recurring, today, dismissed }),
    [transactions, recurring, today, dismissed],
  );
  if (nudges.length === 0) return null;
  return (
    <section className="card" aria-labelledby="nudges-title" data-testid="nudges">
      <h2 id="nudges-title">{tl('Worth a look')}</h2>
      <ul className="nudge-list">
        {nudges.slice(0, SHOWN).map((n) => (
          <NudgeRow key={n.id} n={n} />
        ))}
      </ul>
      {nudges.length > SHOWN && (
        <p className="muted small">
          {tl(
            '{0} after these.',
            nudges.length - SHOWN === 1 ? tl('1 more') : tl('{0} more', nudges.length - SHOWN),
          )}
        </p>
      )}
    </section>
  );
}
