import { useEffect, useMemo, useRef, useState } from 'react';
import { Money } from '../app/Money';
import { useLedger } from '../data/store';
import { inMonth, previousMonth } from '../domain/aggregates';
import { budgetsForMonth, budgetStatus } from '../domain/budgets';
import { normalizeMerchantKey } from '../domain/categoriser';
import { categoryById } from '../domain/categories';
import { fmtDate, monthLabel } from '../domain/dates';
import type { Transaction } from '../domain/types';
import { getPointer, subscribeHighlight, useHighlight } from './entityBus';
import { createSpring2D } from './spring';
import { useScopedTransactions, useViewMonth } from './view';

const DELAY_MS = 350;

function matches(key: string, t: Transaction): boolean {
  const [kind, ...rest] = key.split(':');
  const id = rest.join(':');
  switch (kind) {
    case 'category':
      return t.categoryId === id;
    case 'merchant':
      return (normalizeMerchantKey(t.merchant) || 'untitled').replace(/\s+/g, '_') === id;
    case 'method':
      return t.method.replace(/\s+/g, '_') === id;
    case 'tag':
      return t.tags.includes(id);
    case 'day':
      return t.date === id;
    case 'month':
      return t.date.startsWith(id);
    default:
      return false;
  }
}

function Body({ entityKey }: { entityKey: string }) {
  const all = useScopedTransactions();
  const categories = useLedger((s) => s.categories);
  const budgets = useLedger((s) => s.budgets);
  const currency = useLedger((s) => s.settings.currency);
  const month = useViewMonth();
  const [kind, ...rest] = entityKey.split(':');
  const id = rest.join(':');
  const list = useMemo(() => all.filter((t) => matches(entityKey, t)), [all, entityKey]);
  const sum = (l: Transaction[]) => l.reduce((s, t) => s + t.amountMinor, 0);

  if (kind === 'day' || kind === 'month') {
    const title = kind === 'day' ? fmtDate(id) : monthLabel(id);
    return (
      <>
        <strong>{title}</strong>
        <span>
          <Money minor={sum(list)} currency={currency} />,{' '}
          {list.length === 1 ? '1 entry' : `${list.length} entries`}
        </span>
        {kind === 'day' &&
          list.slice(0, 3).map((t) => (
            <span key={t.id} className="hc-row">
              <span>{t.merchant}</span>
              <Money minor={t.amountMinor} currency={currency} />
            </span>
          ))}
      </>
    );
  }

  const now = inMonth(list, month);
  const before = inMonth(list, previousMonth(month));
  const title =
    kind === 'category'
      ? (categoryById(categories, id)?.name ?? 'Other')
      : kind === 'tag'
        ? `#${id}`
        : kind === 'method'
          ? id.replace(/_/g, ' ')
          : (list[0]?.merchant ?? id);
  const budget = kind === 'category' ? budgetsForMonth(budgets, month).categories[id] : undefined;
  const status = budget !== undefined ? budgetStatus(sum(now), budget) : null;
  const last = list[0];
  return (
    <>
      <strong>{title}</strong>
      <span>
        <Money minor={sum(now)} currency={currency} /> in {monthLabel(month)},{' '}
        {now.length === 1 ? '1 entry' : `${now.length} entries`}
      </span>
      <span className="muted">
        <Money minor={sum(before)} currency={currency} /> the month before
      </span>
      {status && (
        <span className={status.kind === 'over' ? 'status-over' : undefined}>
          {status.kind === 'over' ? (
            <>
              Over budget by <Money minor={status.overMinor} currency={currency} />
            </>
          ) : (
            <>
              <Money minor={status.leftMinor} currency={currency} /> of the budget left
            </>
          )}
        </span>
      )}
      {kind === 'merchant' && last && (
        <span className="muted">
          Last on {fmtDate(last.date)}, {list.length === 1 ? 'once' : `${list.length} times`} in all
        </span>
      )}
      <span className="muted small">Click to pin or open</span>
    </>
  );
}

/**
 * A small card about whatever is highlighted, shown after a short pause. It trails the pointer on a
 * spring (or sits under a focused element). Decorative: the same facts are in the page and labels.
 */
export function HoverCard() {
  const key = useHighlight();
  const [shown, setShown] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const spring = useRef<ReturnType<typeof createSpring2D> | null>(null);

  useEffect(() => {
    const sp = createSpring2D((x, y) => {
      if (card.current) card.current.style.transform = `translate(${x}px, ${y}px)`;
    });
    spring.current = sp;
    return () => sp.stop();
  }, []);

  useEffect(() => {
    if (!key) {
      const t = window.setTimeout(() => setShown(null), 0);
      return () => window.clearTimeout(t);
    }
    const timer = window.setTimeout(() => setShown(key), DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [key]);

  useEffect(() => {
    if (!shown) return;
    const place = () => {
      const p = getPointer();
      const w = card.current?.offsetWidth ?? 220;
      const h = card.current?.offsetHeight ?? 100;
      const x = Math.min(window.innerWidth - w - 8, Math.max(8, p.x + 16));
      const below = p.rect ? p.rect.bottom + 8 : p.y + 20;
      const y = below + h > window.innerHeight - 8 ? (p.rect ? p.rect.top : p.y) - h - 12 : below;
      spring.current?.set(x, y);
    };
    place();
    return subscribeHighlight(place);
  }, [shown]);

  if (!shown || shown !== key) return null;
  return (
    <div className="hover-card" ref={card} aria-hidden="true" data-testid="hover-card">
      <Body entityKey={shown} />
    </div>
  );
}
