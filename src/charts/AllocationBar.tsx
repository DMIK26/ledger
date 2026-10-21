import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Money, usePrivacy } from '../app/Money';
import { BUDGET_STEP, moveAllocation, type Segment } from '../domain/budgets';
import { categoryById } from '../domain/categories';
import { fmtMoney } from '../domain/money';
import type { Category } from '../domain/types';
import { fillFor } from './fills';

interface Props {
  segments: Segment[];
  /** Overall budget not given to any category; shown as a plain segment at the end. */
  unallocatedMinor: number;
  categories: readonly Category[];
  currency: string;
  onCommit: (segments: Segment[]) => void;
}

/**
 * Category budgets as one bar. Dragging a divider (or arrow keys on it) moves budget between the two
 * neighbours in ₹500 steps; the total stays fixed.
 */
export function AllocationBar({
  segments,
  unallocatedMinor,
  categories,
  currency,
  onCommit,
}: Props) {
  const bar = useRef<HTMLDivElement>(null);
  const masked = usePrivacy();
  const [draft, setDraft] = useState<Segment[] | null>(null);
  const [drag, setDrag] = useState<{ index: number; startX: number; start: Segment[] } | null>(
    null,
  );
  const shown = draft ?? segments;
  const total = shown.reduce((s, x) => s + x.amountMinor, 0) + Math.max(0, unallocatedMinor);
  const name = (id: string) => categoryById(categories, id)?.name ?? 'Other';
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const onPointerDown = (index: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ index, startX: e.clientX, start: shown });
    setDraft(shown);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag || !bar.current) return;
    const w = bar.current.getBoundingClientRect().width || 1;
    const delta = ((e.clientX - drag.startX) / w) * total;
    setDraft(moveAllocation(drag.start, drag.index, delta));
  };
  const finish = () => {
    if (!drag) return;
    const next = draft;
    setDrag(null);
    setDraft(null);
    if (next && next.some((s, i) => s.amountMinor !== segments[i]?.amountMinor)) onCommit(next);
  };
  const onKeyDown = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = moveAllocation(segments, index, step * BUDGET_STEP);
    if (next.some((s, i) => s.amountMinor !== segments[i]?.amountMinor)) onCommit(next);
  };

  const lefts = shown.reduce<number[]>(
    (acc, s) => [...acc, (acc[acc.length - 1] ?? 0) + pct(s.amountMinor)],
    [],
  );
  return (
    <div className="alloc">
      <div className="alloc-bar" ref={bar}>
        {shown.map((s) => (
          <span
            key={s.id}
            className="alloc-seg"
            style={{
              width: `${pct(s.amountMinor)}%`,
              background: fillFor(categoryById(categories, s.id)),
            }}
          />
        ))}
        {unallocatedMinor > 0 && (
          <span className="alloc-seg alloc-free" style={{ width: `${pct(unallocatedMinor)}%` }} />
        )}
        {shown.slice(0, -1).map((s, i) => {
          const left = lefts[i] ?? 0;
          const next = shown[i + 1]!;
          return (
            <button
              key={`${s.id}-${next.id}`}
              type="button"
              className="alloc-divider"
              style={{ left: `${left}%` }}
              role="slider"
              aria-label={`Move budget between ${name(s.id)} and ${name(next.id)}`}
              aria-valuetext={`${name(s.id)} ${fmtMoney(s.amountMinor, { currency })}, ${name(next.id)} ${fmtMoney(next.amountMinor, { currency })}`}
              aria-valuemin={masked ? undefined : 0}
              aria-valuemax={
                masked ? undefined : Math.round((s.amountMinor + next.amountMinor) / 100)
              }
              aria-valuenow={masked ? undefined : Math.round(s.amountMinor / 100)}
              data-testid={`divider-${i}`}
              onPointerDown={onPointerDown(i)}
              onPointerMove={onPointerMove}
              onPointerUp={finish}
              onPointerCancel={finish}
              onKeyDown={onKeyDown(i)}
            />
          );
        })}
      </div>
      <ul className="legend alloc-legend">
        {shown.map((s) => (
          <li key={s.id} className="legend-item">
            <span className="dot" style={{ background: categoryById(categories, s.id)?.color }} />
            <span className="legend-name">{name(s.id)}</span>
            <Money minor={s.amountMinor} currency={currency} />
          </li>
        ))}
        {unallocatedMinor > 0 && (
          <li className="legend-item">
            <span
              className="dot"
              style={{ background: 'var(--fill)', outline: '1px solid var(--border)' }}
            />
            <span className="legend-name">Not given to a category</span>
            <Money minor={unallocatedMinor} currency={currency} />
          </li>
        )}
      </ul>
    </div>
  );
}
