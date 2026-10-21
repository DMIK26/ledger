import { useLedger } from '../data/store';
import { categoryById } from '../domain/categories';
import { fmtDate } from '../domain/dates';
import type { Transaction } from '../domain/types';
import { Icon } from './icons';
import { Money } from './Money';

function Row({ tx, onDelete }: { tx: Transaction; onDelete?: (id: string) => void }) {
  const categories = useLedger((s) => s.categories);
  const category = categoryById(categories, tx.categoryId);
  const showRaw = tx.raw && tx.raw.trim().toLowerCase() !== tx.merchant.toLowerCase();

  return (
    <li className="tx-row" data-testid="tx-row">
      <span className="tx-date">{fmtDate(tx.date)}</span>
      <span className="tx-merchant">
        <span>{tx.merchant || 'Untitled'}</span>
        {showRaw && <span className="tx-raw">{tx.raw}</span>}
      </span>
      <span className="tx-cat">
        <span className="chip">
          <span className="dot" style={{ background: category?.color ?? 'var(--faint)' }} />
          {category?.name ?? 'Other'}
        </span>
        <span className="tx-mobile-meta">
          {fmtDate(tx.date)} · {tx.method}
        </span>
      </span>
      <span className="tx-method">{tx.method}</span>
      <Money className="tx-amount" minor={tx.amountMinor} currency={tx.currency} />
      {onDelete ? (
        <button
          type="button"
          className="btn btn-ghost btn-icon tx-delete"
          aria-label={`Delete ${tx.merchant || 'entry'} on ${fmtDate(tx.date)}`}
          onClick={() => onDelete(tx.id)}
        >
          <Icon name="trash" />
        </button>
      ) : (
        <span className="tx-delete" />
      )}
    </li>
  );
}

export function TxList({
  transactions,
  onDelete,
  label,
}: {
  transactions: Transaction[];
  onDelete?: (id: string) => void;
  label: string;
}) {
  return (
    <ul className="tx-list" aria-label={label}>
      {transactions.map((tx) => (
        <Row key={tx.id} tx={tx} onDelete={onDelete} />
      ))}
    </ul>
  );
}
