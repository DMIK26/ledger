import { useState } from 'react';
import { EmptyDoodle } from '../../doodle/bits';
import { useLedger } from '../../data/store';
import { fmtDate, todayISO } from '../../domain/dates';
import { warranties, WARRANTY_ENDED_DAYS, type WarrantyRow } from '../../domain/warranties';
import { Money } from '../Money';
import { ReceiptViewer } from '../ReceiptViewer';
import { href } from '../router';
import { tl } from '../../domain/i18n';

function Row({ row, onReceipt }: { row: WarrantyRow; onReceipt: (id: string) => void }) {
  const currency = useLedger((s) => s.settings.currency);
  const { tx, ends, daysLeft } = row;
  const left =
    daysLeft < 0
      ? tl('Ended on {0}', fmtDate(ends))
      : daysLeft === 0
        ? tl('Ends today')
        : tl(
            'Ends on {0}, {1}',
            fmtDate(ends),
            daysLeft === 1 ? tl('1 day left') : tl('{0} days left', daysLeft),
          );
  return (
    <li
      className="wish-row"
      data-testid="warranty-row"
      data-soon={daysLeft >= 0 && daysLeft <= 30 ? '' : undefined}
    >
      <div className="money-main">
        <span className="wish-name">{tx.merchant || tl('Untitled')}</span>
        <span className="muted small">
          {tl(
            'Bought {0}, {1}. {2}.',
            fmtDate(tx.date),
            tx.warrantyMonths === 1 ? tl('1 month') : tl('{0} months', tx.warrantyMonths),
            left,
          )}
        </span>
      </div>
      <Money minor={tx.amountMinor} currency={tx.currency || currency} />
      <div className="btn-row wish-actions">
        {tx.hasReceipt ? (
          <button
            type="button"
            className="btn"
            aria-label={tl('Receipt for {0}', tx.merchant || tl('entry'))}
            onClick={() => onReceipt(tx.id)}
          >
            {tl('Receipt')}
          </button>
        ) : (
          <span className="muted small">
            {tl('No receipt kept; add one by editing the entry.')}
          </span>
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
        <a href={href('/transactions')}>{tl('Back to transactions')}</a>
      </p>
      {active.length === 0 && ended.length === 0 ? (
        <section className="card empty">
          <EmptyDoodle art="receipt" />
          <h2>{tl('No warranties yet')}</h2>
          <p className="muted">
            {tl(
              'When you add something with a warranty, put its months in the form under “Who it was for, tax and warranty” and keep a photo of the receipt.',
            )}
          </p>
        </section>
      ) : (
        <>
          <section className="card" aria-labelledby="warranty-title">
            <h2 id="warranty-title">{tl('Warranties')}</h2>
            {active.length === 0 ? (
              <p className="muted small">{tl('None running now.')}</p>
            ) : (
              <ul className="money-list" aria-label={tl('Running')}>
                {active.map((r) => (
                  <Row key={r.tx.id} row={r} onReceipt={setReceiptId} />
                ))}
              </ul>
            )}
          </section>
          {ended.length > 0 && (
            <section className="card" aria-labelledby="warranty-ended-title">
              <h2 id="warranty-ended-title">
                {tl('Ended in the last {0} days', WARRANTY_ENDED_DAYS)}
              </h2>
              <ul className="money-list" aria-label={tl('Ended')}>
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
