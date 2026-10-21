import { useLedger } from '../data/store';
import { categoryById } from '../domain/categories';
import { fmtDate } from '../domain/dates';
import type { Transaction } from '../domain/types';
import { EntryForm } from './EntryForm';
import { Icon } from './icons';
import { Money, usePrivacy } from './Money';

export interface RowActions {
  onDelete?: (id: string) => void;
  onEdit?: (id: string | null) => void;
  onReceipt?: (id: string) => void;
  /** Present when rows can be selected for bulk actions. */
  selected?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  editingId?: string | null;
}

function Row({ tx, actions }: { tx: Transaction; actions: RowActions }) {
  const categories = useLedger((s) => s.categories);
  const masked = usePrivacy();
  const category = categoryById(categories, tx.categoryId);
  // The typed text holds the amount, so privacy mode hides it along with every other figure.
  const showRaw = !masked && tx.raw && tx.raw.trim().toLowerCase() !== tx.merchant.toLowerCase();
  const name = tx.merchant || 'entry';
  const when = fmtDate(tx.date);

  if (actions.editingId === tx.id && actions.onEdit) {
    const close = () => actions.onEdit?.(null);
    return (
      <li className="tx-row tx-editing" data-testid="tx-edit">
        <EntryForm
          editing={{
            id: tx.id,
            hasReceipt: tx.hasReceipt,
            draft: {
              date: tx.date,
              amountMinor: tx.amountMinor,
              merchant: tx.merchant,
              categoryId: tx.categoryId,
              method: tx.method,
              notes: tx.notes,
              tags: tx.tags,
            },
          }}
          autoFocus
          submitLabel="Save changes"
          onDone={close}
        />
      </li>
    );
  }

  const selectable = actions.selected !== undefined && actions.onToggle !== undefined;

  return (
    <li className={selectable ? 'tx-row tx-selectable' : 'tx-row'} data-testid="tx-row">
      {selectable && (
        <span className="tx-select">
          <input
            type="checkbox"
            className="checkbox"
            aria-label={`Select ${name} on ${when}`}
            checked={actions.selected!.has(tx.id)}
            onChange={() => actions.onToggle!(tx.id)}
          />
        </span>
      )}
      <span className="tx-date">{when}</span>
      <span className="tx-merchant">
        <span>{tx.merchant || 'Untitled'}</span>
        {showRaw && <span className="tx-raw">{tx.raw}</span>}
        {tx.tags.length > 0 && (
          <span className="tx-tags">
            {tx.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="tx-cat">
        <span className="chip">
          <span className="dot" style={{ background: category?.color ?? 'var(--faint)' }} />
          {category?.name ?? 'Other'}
          {tx.unsure && <span className="chip-note">unsure</span>}
        </span>
        <span className="tx-mobile-meta">
          {when} · {tx.method}
        </span>
      </span>
      <span className="tx-method">{tx.method}</span>
      <Money className="tx-amount" minor={tx.amountMinor} currency={tx.currency} />
      <span className="tx-actions">
        {tx.hasReceipt && actions.onReceipt && (
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label={`Receipt for ${name} on ${when}`}
            onClick={() => actions.onReceipt?.(tx.id)}
          >
            <Icon name="receipt" />
          </button>
        )}
        {actions.onEdit && (
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label={`Edit ${name} on ${when}`}
            onClick={() => actions.onEdit?.(tx.id)}
          >
            <Icon name="edit" />
          </button>
        )}
        {actions.onDelete && (
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label={`Delete ${name} on ${when}`}
            onClick={() => actions.onDelete?.(tx.id)}
          >
            <Icon name="trash" />
          </button>
        )}
      </span>
    </li>
  );
}

export function TxList({
  transactions,
  label,
  ...actions
}: RowActions & { transactions: Transaction[]; label: string }) {
  return (
    <ul className="tx-list" aria-label={label}>
      {transactions.map((tx) => (
        <Row key={tx.id} tx={tx} actions={actions} />
      ))}
    </ul>
  );
}
