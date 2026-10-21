import { useLedger } from '../../data/store';
import { Money } from '../Money';
import { QuickAdd } from '../QuickAdd';
import { TxList } from '../TxList';

export function Transactions({ adding }: { adding: boolean }) {
  const transactions = useLedger((s) => s.transactions);
  const currency = useLedger((s) => s.settings.currency);
  const removeTransaction = useLedger((s) => s.removeTransaction);
  const total = transactions.reduce((sum, t) => sum + t.amountMinor, 0);
  const count = transactions.length;

  return (
    <>
      <QuickAdd autoFocus={adding} />
      {count === 0 ? (
        <section className="card empty">
          <h2>Nothing logged yet</h2>
          <p className="muted">Every expense you add shows up here, newest first.</p>
        </section>
      ) : (
        <section className="card" aria-label="All transactions">
          <TxList
            label="Transactions"
            transactions={transactions}
            onDelete={(id) => void removeTransaction(id)}
          />
          <div className="tx-footer" data-testid="tx-footer">
            <span>{count === 1 ? '1 transaction' : `${count} transactions`}</span>
            <Money minor={total} currency={currency} />
          </div>
        </section>
      )}
    </>
  );
}
