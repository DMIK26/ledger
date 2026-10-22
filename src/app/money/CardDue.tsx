import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { cardsDueSoon } from '../../domain/accounts';
import { fmtDate, todayISO } from '../../domain/dates';
import { Money } from '../Money';
import { href } from '../router';

/** Dashboard note for credit cards due within a week (or late). Shows nothing otherwise. */
export function CardDue() {
  const accounts = useLedger((s) => s.accounts);
  const transactions = useLedger((s) => s.transactions);
  const flows = useLedger((s) => s.flows);
  const udhaar = useLedger((s) => s.udhaar);
  const currency = useLedger((s) => s.settings.currency);
  const today = todayISO();
  const due = useMemo(
    () => cardsDueSoon(accounts, { transactions, flows, udhaar }, today),
    [accounts, transactions, flows, udhaar, today],
  );
  if (due.length === 0) return null;
  return (
    <section className="card card-due" aria-label="Card payments due" data-testid="card-due">
      <ul className="money-list">
        {due.map(({ card, status }) => (
          <li key={card.id} className="money-row">
            <span className="money-main">
              <span>{card.name}</span>
              <span className={status.overdue ? 'status-over small' : 'muted small'}>
                {status.overdue
                  ? `Was due ${fmtDate(status.dueDate!)}`
                  : status.daysToDue === 0
                    ? 'Due today'
                    : `Due ${fmtDate(status.dueDate!)}, in ${status.daysToDue} ${status.daysToDue === 1 ? 'day' : 'days'}`}
              </span>
            </span>
            <Money minor={status.dueMinor} currency={currency} />
          </li>
        ))}
      </ul>
      <a className="small" href={href('/money')}>
        Record a payment on Money
      </a>
    </section>
  );
}
