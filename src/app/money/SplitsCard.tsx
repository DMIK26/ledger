import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { groupBalances, simplifyDebts } from '../../domain/splits';
import { Money } from '../Money';

/**
 * Who pays whom (Drop 11, after Splitwise): the open splits netted to the fewest transfers. "Mark all
 * settled" records your part with each person as settled, in one undoable step.
 */
export function SplitsCard() {
  const transactions = useLedger((s) => s.transactions);
  const settled = useLedger((s) => s.settledSplits);
  const people = useLedger((s) => s.people);
  const currency = useLedger((s) => s.settings.currency);
  const settleSplits = useLedger((s) => s.settleSplits);
  const open = useMemo(
    () => transactions.filter((t) => t.split && !settled.includes(t.id)),
    [transactions, settled],
  );
  const transfers = useMemo(() => simplifyDebts(groupBalances(open.map((t) => t.split!))), [open]);
  if (open.length === 0) return null;
  const name = (id: string) =>
    id === '' ? 'You' : (people.find((p) => p.id === id)?.name ?? 'Someone');
  return (
    <section className="card" aria-labelledby="splits-title" data-testid="splits">
      <div className="card-head">
        <h2 id="splits-title">Who pays whom</h2>
        <span className="muted small">
          {open.length === 1 ? '1 open split' : `${open.length} open splits`}
        </span>
      </div>
      {transfers.length === 0 ? (
        <p className="muted small">Everyone is square on the open splits.</p>
      ) : (
        <ul className="money-list">
          {transfers.map((t) => (
            <li key={`${t.from}>${t.to}`} className="money-row" data-testid="transfer">
              <span className="money-main">
                {name(t.from)} {t.from === '' ? 'pay' : 'pays'} {name(t.to)}
              </span>
              <Money minor={t.amountMinor} currency={currency} />
              <span />
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        The fewest payments that settle every open split. Your own udhaar with each person shows
        above.
      </p>
      <button type="button" className="btn" onClick={() => void settleSplits()}>
        Mark all settled
      </button>
    </section>
  );
}
