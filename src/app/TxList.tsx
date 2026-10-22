import { useRef, useState, type PointerEvent } from 'react';
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
  /** `range`: Shift was held, so select everything from the last row chosen. */
  onToggle?: (id: string, range?: boolean) => void;
  editingId?: string | null;
  /** Columns turned off with Columns ('category', 'method', 'account', 'tags'). */
  hidden?: readonly string[];
}

/** How far (px) a row must be swiped on a phone to delete (left) or edit (right). */
export const ROW_SWIPE = 90;

function Row({ tx, actions }: { tx: Transaction; actions: RowActions }) {
  const categories = useLedger((s) => s.categories);
  const accounts = useLedger((s) => s.accounts);
  const masked = usePrivacy();
  const [dx, setDx] = useState(0);
  const swipe = useRef<{ x: number; y: number; locked: boolean | null } | null>(null);
  const shift = useRef(false);
  const hidden = actions.hidden ?? [];
  const account =
    !hidden.includes('account') && accounts.length > 0
      ? accounts.find(
          (a) => a.id === (tx.accountId ?? accounts.find((x) => x.methods.includes(tx.method))?.id),
        )
      : undefined;
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
            split: tx.split,
            draft: {
              date: tx.date,
              // A split is edited as the whole bill.
              amountMinor: tx.split ? tx.split.totalMinor : tx.amountMinor,
              merchant: tx.merchant,
              categoryId: tx.categoryId,
              method: tx.method,
              notes: tx.notes,
              tags: tx.tags,
              accountId: tx.accountId,
              foreign: tx.foreign,
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
  const swipeable = actions.onDelete !== undefined || actions.onEdit !== undefined;

  // Phones: swipe left to delete, right to edit. Vertical moves stay scrolling.
  const onPointerDown = (e: PointerEvent<HTMLLIElement>) => {
    if (!swipeable || e.pointerType !== 'touch') return;
    swipe.current = { x: e.clientX, y: e.clientY, locked: null };
  };
  const onPointerMove = (e: PointerEvent<HTMLLIElement>) => {
    const s = swipe.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.locked === null && Math.abs(mx) + Math.abs(my) > 10) {
      s.locked = Math.abs(mx) > Math.abs(my) * 1.5;
      if (s.locked) e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (s.locked) setDx(mx);
  };
  const onPointerEnd = () => {
    const s = swipe.current;
    swipe.current = null;
    const moved = dx;
    setDx(0);
    if (!s?.locked) return;
    if (moved <= -ROW_SWIPE && actions.onDelete) actions.onDelete(tx.id);
    else if (moved >= ROW_SWIPE && actions.onEdit) actions.onEdit(tx.id);
  };

  return (
    <li
      className={selectable ? 'tx-row tx-selectable' : 'tx-row'}
      data-testid="tx-row"
      data-id={tx.id}
      data-anchor={`tx:${tx.id}`}
      data-entity={txEntities(tx)}
      data-hl={catKey}
      data-swipe={dx <= -ROW_SWIPE ? 'delete' : dx >= ROW_SWIPE ? 'edit' : undefined}
      style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={() => {
        swipe.current = null;
        setDx(0);
      }}
    >
      {selectable && (
        <label className="tx-select">
          <input
            type="checkbox"
            className="checkbox"
            aria-label={`Select ${name} on ${when}`}
            checked={actions.selected!.has(tx.id)}
            onClick={(e) => {
              shift.current = e.shiftKey;
            }}
            onChange={() => {
              actions.onToggle!(tx.id, shift.current);
              shift.current = false;
            }}
          />
        </label>
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
        {tx.tags.length > 0 && !hidden.includes('tags') && (
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
          {when}
          {hidden.includes('method') ? '' : ` · ${tx.method}`}
          {account ? ` · ${account.name}` : ''}
          {tx.split ? ' · split' : ''}
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
        {account && <span className="tx-account muted small">{account.name}</span>}
      </span>
      <span className="tx-amount">
        <Money minor={tx.amountMinor} currency={tx.currency} />
        {tx.foreign && (
          <Money
            className="tx-foreign muted small"
            minor={tx.foreign.amountMinor}
            currency={tx.foreign.currency}
          />
        )}
      </span>
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
    <ul className="tx-list" aria-label={label} data-hide={actions.hidden?.join(' ') || undefined}>
      {transactions.map((tx) => (
        <Row key={tx.id} tx={tx} actions={actions} />
      ))}
    </ul>
  );
}
