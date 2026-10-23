import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { fmtDate, todayISO } from '../../domain/dates';
import { findNudges, type Nudge } from '../../domain/nudges';
import { Money } from '../Money';
import { href } from '../router';

const SHOWN = 4;

function NudgeRow({ n }: { n: Nudge }) {
  const currency = useLedger((s) => s.settings.currency);
  const dismissNudge = useLedger((s) => s.dismissNudge);
  const removeTransaction = useLedger((s) => s.removeTransaction);
  const saveRecurring = useLedger((s) => s.saveRecurring);
  const m = (minor: number) => <Money minor={minor} currency={currency} />;
  const fine = (label = 'Fine') => (
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
        Two entries of {m(n.second.amountMinor)} at {n.second.merchant || 'Untitled'}{' '}
        {same
          ? `on ${fmtDate(n.second.date)}`
          : `on ${fmtDate(n.first.date)} and ${fmtDate(n.second.date)}`}
        . One may be a repeat.
      </>
    );
    actions = (
      <>
        <button type="button" className="btn" onClick={() => void removeTransaction(n.second.id)}>
          Delete the later one
        </button>
        {fine('Both are right')}
      </>
    );
  } else if (n.kind === 'unusual') {
    text = (
      <>
        {m(n.tx.amountMinor)} at {n.tx.merchant} on {fmtDate(n.tx.date)} is about {n.times} times
        your usual {m(n.usualMinor)}.
      </>
    );
    actions = (
      <>
        <a className="btn" href={href(`/merchant?key=${encodeURIComponent(n.merchantKey)}`)}>
          See {n.tx.merchant}
        </a>
        {fine()}
      </>
    );
  } else if (n.kind === 'price') {
    text = (
      <>
        {n.item.merchant} went up from {m(n.fromMinor)} to {m(n.toMinor)}, {m(n.yearlyMinor)} more a
        year.
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
                `Updated ${n.item.merchant} to the new price`,
              ).then(() => dismissNudge(n.id))
            }
          >
            Update the recurring amount
          </button>
        )}
        {fine()}
      </>
    );
  } else {
    text = (
      <>
        The warranty for {n.tx.merchant || 'an entry'} ends on {fmtDate(n.ends)}
        {n.daysLeft === 0 ? ', today' : n.daysLeft === 1 ? ', tomorrow' : `, in ${n.daysLeft} days`}
        .
      </>
    );
    actions = (
      <>
        <a className="btn" href={href('/transactions?view=warranties')}>
          See warranties
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
      <h2 id="nudges-title">Worth a look</h2>
      <ul className="nudge-list">
        {nudges.slice(0, SHOWN).map((n) => (
          <NudgeRow key={n.id} n={n} />
        ))}
      </ul>
      {nudges.length > SHOWN && (
        <p className="muted small">
          {nudges.length - SHOWN === 1 ? '1 more' : `${nudges.length - SHOWN} more`} after these.
        </p>
      )}
    </section>
  );
}
