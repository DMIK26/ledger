import { useLedger } from '../../data/store';
import { monthKey, monthLabel, todayISO } from '../../domain/dates';
import { Money } from '../Money';
import { QuickAdd } from '../QuickAdd';
import { href } from '../router';
import { TxList } from '../TxList';

export function Dashboard() {
  const transactions = useLedger((s) => s.transactions);
  const currency = useLedger((s) => s.settings.currency);
  const removeTransaction = useLedger((s) => s.removeTransaction);

  const thisMonth = monthKey(todayISO());
  const monthEntries = transactions.filter((t) => monthKey(t.date) === thisMonth);
  const monthTotal = monthEntries.reduce((sum, t) => sum + t.amountMinor, 0);
  const recent = transactions.slice(0, 6);

  return (
    <>
      <QuickAdd />
      <section className="card" aria-labelledby="month-title">
        <div className="card-head">
          <h2 id="month-title">This month</h2>
          <span className="muted small">{monthLabel(thisMonth)}</span>
        </div>
        <p className="big-figure" data-testid="month-total">
          <Money minor={monthTotal} currency={currency} />
        </p>
        <p className="muted small">
          {monthEntries.length === 1 ? '1 entry' : `${monthEntries.length} entries`}
        </p>
      </section>
      {transactions.length === 0 ? (
        <section className="card empty">
          <h2>Nothing logged yet</h2>
          <p className="muted">Type your first expense above, something like “chai 20 cash”.</p>
        </section>
      ) : (
        <section className="card" aria-labelledby="recent-title">
          <div className="card-head">
            <h2 id="recent-title">Recent</h2>
            <a href={href('/transactions')} className="small">
              See all
            </a>
          </div>
          <TxList
            label="Recent transactions"
            transactions={recent}
            onDelete={(id) => void removeTransaction(id)}
          />
        </section>
      )}
    </>
  );
}
