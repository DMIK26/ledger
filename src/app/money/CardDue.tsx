import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { cardsDueSoon } from '../../domain/accounts';
import { fmtDate, todayISO } from '../../domain/dates';
import { Money } from '../Money';
import { href } from '../router';
import { tl } from '../../domain/i18n';

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
    <section className="card card-due" aria-label={tl('Card payments due')} data-testid="card-due">
      <ul className="money-list">
        {due.map(({ card, status }) => (
          <li key={card.id} className="money-row">
            <span className="money-main">
              <span>{card.name}</span>
              <span className={status.overdue ? 'status-over small' : 'muted small'}>
                {status.overdue
                  ? tl('Was due {0}', fmtDate(status.dueDate!))
                  : status.daysToDue === 0
                    ? tl('Due today')
                    : tl(
                        'Due {0}, in {1} {2}',
                        fmtDate(status.dueDate!),
                        status.daysToDue,
                        status.daysToDue === 1 ? tl('day') : tl('days'),
                      )}
              </span>
            </span>
            <Money minor={status.dueMinor} currency={currency} />
          </li>
        ))}
      </ul>
      <a className="small" href={href('/money')}>
        {tl('Record a payment on Money')}
      </a>
    </section>
  );
}
