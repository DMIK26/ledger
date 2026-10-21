import { useLedger } from '../data/store';
import { categoryById } from '../domain/categories';
import { fmtDate } from '../domain/dates';
import type { Transaction } from '../domain/types';
import { EntryForm } from './EntryForm';
import { Icon } from './icons';
import { Money, usePrivacy } from './Money';
import { normalizeMerchantKey } from '../domain/categoriser';
import type { Pin } from '../domain/pins';
import { entityKey, merchantKey, txEntities } from '../kit/entityKeys';
import { usePins, useView } from '../kit/view';

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
  const pins = usePins();
  const toggle = useView((s) => s.togglePin);
  const isPinned = (kind: Pin['kind'], id: string) =>
    pins.some((p) => p.kind === kind && p.id === id);
  const catKey = entityKey('category', tx.categoryId);
  const mKey = normalizeMerchantKey(tx.merchant) || 'untitled';
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
    <li
      className={selectable ? 'tx-row tx-selectable' : 'tx-row'}
      data-testid="tx-row"
      data-id={tx.id}
      data-anchor={`tx:${tx.id}`}
      data-entity={txEntities(tx)}
      data-hl={catKey}
    >
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
        <span>
          <button
            type="button"
            className="link-button"
            data-hl={merchantKey(tx.merchant)}
            aria-pressed={isPinned('merchant', mKey)}
            title={`Pin ${tx.merchant || 'Untitled'} to every page`}
            onClick={() => toggle({ kind: 'merchant', id: mKey, label: tx.merchant || 'Untitled' })}
          >
            {tx.merchant || 'Untitled'}
          </button>
        </span>
        {showRaw && <span className="tx-raw">{tx.raw}</span>}
        {tx.tags.length > 0 && (
          <span className="tx-tags">
            {tx.tags.map((t) => (
              <button
                key={t}
                type="button"
                className="tag"
                data-hl={entityKey('tag', t)}
                aria-pressed={isPinned('tag', t)}
                title={`Pin tag ${t} to every page`}
                onClick={() => toggle({ kind: 'tag', id: t, label: `#${t}` })}
              >
                {t}
              </button>
            ))}
          </span>
        )}
      </span>
      <span className="tx-cat">
        <button
          type="button"
          className="chip chip-pin"
          aria-pressed={isPinned('category', tx.categoryId)}
          title={`Pin ${category?.name ?? 'Other'} to every page`}
          onClick={() =>
            toggle({ kind: 'category', id: tx.categoryId, label: category?.name ?? 'Other' })
          }
        >
          <span className="dot" style={{ background: category?.color ?? 'var(--faint)' }} />
          {category?.name ?? 'Other'}
          {tx.unsure && <span className="chip-note">unsure</span>}
        </button>
        <span className="tx-mobile-meta">
          {when} · {tx.method}
        </span>
      </span>
      <span className="tx-method">
        <button
          type="button"
          className="link-button"
          data-hl={entityKey('method', tx.method)}
          aria-pressed={isPinned('method', tx.method)}
          title={`Pin ${tx.method} to every page`}
          onClick={() => toggle({ kind: 'method', id: tx.method, label: tx.method })}
        >
          {tx.method}
        </button>
      </span>
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
