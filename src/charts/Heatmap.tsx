import { useRef, useState, type PointerEvent } from 'react';
import { usePrivacy } from '../app/Money';
import { entityKey } from '../kit/entityKeys';
import { useRoving } from '../kit/roving';
import { dayShort, diffDays, fmtDate, monthShort, parseISO, weekdayOf } from '../domain/dates';
import { fmtMoney } from '../domain/money';
import type { DayCell } from '../domain/reports';
import { tl } from '../domain/i18n';
import { tr } from '../app/tr';

/** Monday = 0 ... Sunday = 6 */
const mondayIndex = (iso: string) => (weekdayOf(iso) + 6) % 7;

/** Splits non-zero days into four equal-count bands, so one huge day does not wash out the rest. */
function bands(days: readonly DayCell[]): number[] {
  const values = days
    .map((d) => d.totalMinor)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return [];
  return [0.25, 0.5, 0.75].map(
    (q) => values[Math.min(values.length - 1, Math.floor(q * values.length))]!,
  );
}

const level = (v: number, cuts: number[]): number =>
  v <= 0 ? 0 : 1 + cuts.filter((c) => v > c).length;

/**
 * Daily spending as a calendar: weeks run left to right, Monday at the top. Each day says its date and
 * amount to screen readers; colour only adds a quick read of busy days.
 */
export function Heatmap({
  days,
  currency,
  onRange,
  onPick,
}: {
  days: DayCell[];
  currency: string;
  /** Brushing across two or more days (drag with a mouse or pen) picks that range. */
  onRange?: (start: string, end: string) => void;
  /** Clicking or Enter on one day. */
  onPick?: (date: string) => void;
}) {
  usePrivacy(); // labels use fmtMoney
  const roving = useRoving(days.length, 7);
  const [brush, setBrush] = useState<{ from: number; to: number } | null>(null);
  const brushed = useRef(false);
  if (days.length === 0) return null;

  const indexAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-day-index]');
    return el ? Number(el.getAttribute('data-day-index')) : null;
  };
  const onDown = (i: number) => (e: PointerEvent<SVGRectElement>) => {
    if (e.pointerType === 'touch' || !onRange) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    brushed.current = false;
    setBrush({ from: i, to: i });
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    if (!brush) return;
    const i = indexAt(e.clientX, e.clientY);
    if (i !== null && i !== brush.to) {
      brushed.current = true;
      setBrush({ ...brush, to: i });
    }
  };
  const onUp = () => {
    if (!brush) return;
    const [a, b] = [Math.min(brush.from, brush.to), Math.max(brush.from, brush.to)];
    setBrush(null);
    if (a !== b) onRange?.(days[a]!.date, days[b]!.date);
  };
  const inBrush = (i: number) =>
    brush !== null && i >= Math.min(brush.from, brush.to) && i <= Math.max(brush.from, brush.to);
  const cuts = bands(days);
  const offset = mondayIndex(days[0]!.date);
  const weeks = Math.ceil((offset + days.length) / 7);
  const cell = days.length <= 62 ? 28 : 13;
  const gap = days.length <= 62 ? 4 : 3;
  const left = 32;
  const top = 18;
  const width = left + weeks * (cell + gap);
  const height = top + 7 * (cell + gap);

  const monthTicks: Array<{ x: number; label: string }> = [];
  days.forEach((d, i) => {
    const p = parseISO(d.date)!;
    if (i === 0 || p.d === 1) {
      const week = Math.floor((offset + i) / 7);
      monthTicks.push({ x: left + week * (cell + gap), label: monthShort(p.m) });
    }
  });

  return (
    <div className="heatmap">
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={tl(
          'Spending by day. Arrow keys move by day and week; Enter pins a day.{0}',
          onRange ? ' ' + tl('Drag across days with a mouse to pick a range.') : '',
        )}
        data-roving-group=""
      >
        {[1, 2, 3, 4, 5, 6, 0].map((day, i) =>
          i % 2 === 0 ? (
            <text
              key={day}
              className="hm-axis"
              x={0}
              y={top + i * (cell + gap) + cell / 2}
              dy="0.32em"
            >
              {dayShort(day)}
            </text>
          ) : null,
        )}
        {monthTicks.map((t) => (
          <text key={`${t.label}-${t.x}`} className="hm-axis" x={t.x} y={10}>
            {t.label}
          </text>
        ))}
        {days.map((d, index) => {
          const i = diffDays(d.date, days[0]!.date) + offset;
          const rv = roving.props(index);
          const key = entityKey('day', d.date);
          const x = left + Math.floor(i / 7) * (cell + gap);
          const y = top + (i % 7) * (cell + gap);
          const label = `${fmtDate(d.date)}, ${d.totalMinor > 0 ? fmtMoney(d.totalMinor, { currency }) : tl('nothing spent')}`;
          return (
            <rect
              key={d.date}
              className={`hm-cell hm-${level(d.totalMinor, cuts)}`}
              data-brush={inBrush(index) ? '' : undefined}
              data-day-index={index}
              data-anchor={`day:${d.date}`}
              data-hl={key}
              data-entity={key}
              x={x}
              y={y}
              width={cell}
              height={cell}
              rx={3}
              role="button"
              aria-label={label}
              {...rv}
              onPointerDown={onDown(index)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onClick={() => {
                if (brushed.current) {
                  brushed.current = false;
                  return;
                }
                onPick?.(d.date);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPick?.(d.date);
                } else rv.onKeyDown(e);
              }}
            >
              <title>{label}</title>
            </rect>
          );
        })}
      </svg>
      <p className="hm-legend muted small" aria-hidden="true">
        {tr(
          'Less{0}More',
          [0, 1, 2, 3, 4].map((l) => <span key={l} className={`hm-swatch hm-${l}`} />),
        )}
      </p>
    </div>
  );
}
