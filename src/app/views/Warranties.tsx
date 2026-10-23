import { useState } from 'react';
import { EmptyDoodle } from '../../doodle/Studio';
import { useLedger } from '../../data/store';
import { fmtDate, todayISO } from '../../domain/dates';
import { warranties, WARRANTY_ENDED_DAYS, type WarrantyRow } from '../../domain/warranties';
import { Money } from '../Money';
import { ReceiptViewer } from '../ReceiptViewer';
import { href } from '../router';

function Row({ row, onReceipt }: { row: WarrantyRow; onReceipt: (id: string) => void }) {
  const currency = useLedger((s) => s.settings.currency);
  const { tx, ends, daysLeft } = row;
  const left =
    daysLeft < 0
      ? `Ended on ${fmtDate(ends)}`
      : daysLeft === 0
        ? 'Ends today'
        : `Ends on ${fmtDate(ends)}, ${daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}`;
  return (
    <li
      className="wish-row"
      data-testid="warranty-row"
      data-soon={daysLeft >= 0 && daysLeft <= 30 ? '' : undefined}
    >
      <div className="money-main">
        <span className="wish-name">{tx.merchant || 'Untitled'}</span>
        <span className="muted small">
          Bought {fmtDate(tx.date)},{' '}
          {tx.warrantyMonths === 1 ? '1 month' : `${tx.warrantyMonths} months`}. {left}.
        </span>
      </div>
      <Money minor={tx.amountMinor} currency={tx.currency || currency} />
      <div className="btn-row wish-actions">
        {tx.hasReceipt ? (
          <button
            type="button"
            className="btn"
            aria-label={`Receipt for ${tx.merchant || 'entry'}`}
            onClick={() => onReceipt(tx.id)}
          >
            Receipt
          </button>
        ) : (
          <span className="muted small">No receipt kept; add one by editing the entry.</span>
        )}
      </div>
    </li>
  );
}

/**
 * Transactions > Warranties (Drop 12): entries with a warranty, the soonest to end first, with the
 * receipt one tap away; those that ended in the last 90 days below.
 */
export function WarrantiesView() {
  const transactions = useLedger((s) => s.transactions);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const { active, ended } = warranties(transactions, todayISO());
  return (
    <>
      <p>
        <a href={href('/transactions')}>Back to transactions</a>
      </p>
      {active.length === 0 && ended.length === 0 ? (
        <section className="card empty">
          <EmptyDoodle art="receipt" />
          <h2>No warranties yet</h2>
          <p className="muted">
            When you add something with a warranty, put its months in the form under “Who it was
            for, tax and warranty” and keep a photo of the receipt.
          </p>
        </section>
      ) : (
        <>
          <section className="card" aria-labelledby="warranty-title">
            <h2 id="warranty-title">Warranties</h2>
            {active.length === 0 ? (
              <p className="muted small">None running now.</p>
            ) : (
              <ul className="money-list" aria-label="Running">
                {active.map((r) => (
                  <Row key={r.tx.id} row={r} onReceipt={setReceiptId} />
                ))}
              </ul>
            )}
          </section>
          {ended.length > 0 && (
            <section className="card" aria-labelledby="warranty-ended-title">
              <h2 id="warranty-ended-title">Ended in the last {WARRANTY_ENDED_DAYS} days</h2>
              <ul className="money-list" aria-label="Ended">
                {ended.map((r) => (
                  <Row key={r.tx.id} row={r} onReceipt={setReceiptId} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <ReceiptViewer id={receiptId} onClose={() => setReceiptId(null)} />
    </>
  );
}
