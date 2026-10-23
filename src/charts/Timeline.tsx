import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Money, usePrivacy } from '../app/Money';
import { addDays, fmtDate, parseISO } from '../domain/dates';
import { fmtMoney } from '../domain/money';
import { occurrencesBetween, type RecurringItem } from '../domain/recurring';
import type { Category } from '../domain/types';
import { fillFor } from './fills';
import { tick } from '../kit/haptics';
import { tl } from '../domain/i18n';

export const TIMELINE_DAYS = 30;

interface Props {
  items: RecurringItem[];
  categories: readonly Category[];
  currency: string;
  today: string;
  /** Items switched off in the what-if; drawn faded. */
  off: ReadonlySet<string>;
  onShift: (id: string, days: number) => void;
}

/**
 * The next 30 days, one row per recurring payment. Drag a pill sideways (or focus it and use the arrow
 * keys) to move that payment's dates by whole days.
 */
export function Timeline({ items, categories, currency, today, off, onShift }: Props) {
  usePrivacy(); // pill labels use fmtMoney
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    key: string;
    id: string;
    startX: number;
    days: number;
  } | null>(null);
  const days = Array.from({ length: TIMELINE_DAYS }, (_, i) => addDays(today, i));
  const pct = (i: number) => ((i + 0.5) / TIMELINE_DAYS) * 100;

  const dayWidth = () => (track.current?.getBoundingClientRect().width ?? 600) / TIMELINE_DAYS;

  const onPointerDown = (key: string, id: string) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ key, id, startX: e.clientX, days: 0 });
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const days = Math.round((e.clientX - drag.startX) / dayWidth());
    if (days !== drag.days) {
      tick();
      setDrag({ ...drag, days });
    }
  };
  const onPointerUp = () => {
    if (!drag) return;
    const { id, days } = drag;
    setDrag(null);
    if (days !== 0) onShift(id, days);
  };
  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    onShift(id, step);
  };

  return (
    <div className="timeline">
      <div className="tl-head" aria-hidden="true">
        <span />
        <div className="tl-days">
          {days.map((d, i) => {
            const p = parseISO(d)!;
            return (
              <span
                key={d}
                className="tl-day"
                data-today={i === 0 ? '' : undefined}
                style={{ left: `${pct(i)}%` }}
              >
                {i === 0 || p.d === 1 || i % 5 === 0
                  ? p.d === 1 || i === 0
                    ? fmtDate(d).slice(0, -5)
                    : p.d
                  : ''}
              </span>
            );
          })}
        </div>
      </div>
      <ul className="tl-rows">
        {items.map((item) => {
          const dates = occurrencesBetween(item, today, TIMELINE_DAYS);
          const color = fillFor(categories.find((c) => c.id === item.categoryId));
          return (
            <li
              key={item.id}
              className="tl-row"
              data-anchor={`recurring:${item.id}`}
              data-off={off.has(item.id) ? '' : undefined}
            >
              <span className="tl-name">
                <span>{item.merchant}</span>
                <Money minor={item.amountMinor} currency={currency} />
              </span>
              <div className="tl-track" ref={track}>
                {dates.map((d) => {
                  const key = `${item.id}-${d}`;
                  const index = days.indexOf(d);
                  const moving = drag?.id === item.id ? drag.days : 0;
                  const shown = Math.max(0, Math.min(TIMELINE_DAYS - 1, index + moving));
                  return (
                    <button
                      key={key}
                      type="button"
                      className="tl-pill"
                      data-dragging={drag?.key === key ? '' : undefined}
                      style={{ left: `${pct(shown)}%`, background: color }}
                      aria-label={tl(
                        '{0}, {1}, {2}. Move with the arrow keys',
                        item.merchant,
                        fmtMoney(item.amountMinor, { currency }),
                        fmtDate(addDays(today, shown)),
                      )}
                      data-testid={`pill-${item.id}`}
                      onPointerDown={onPointerDown(key, item.id)}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                      onKeyDown={onKeyDown(item.id)}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
