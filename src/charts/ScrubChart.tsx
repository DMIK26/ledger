import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { fmtDate } from '../domain/dates';
import { fmtMoney } from '../domain/money';
import { usePrivacy } from '../app/Money';
import { useSize } from './useSize';
import { tl } from '../domain/i18n';

export interface DayPoint {
  date: string;
  dayMinor: number;
  totalMinor: number;
}

/**
 * The month's spending added up day by day, scrubbable (Drop 11, after Robinhood and Coinbase): a
 * finger, the mouse or the arrow keys move a line along it and report the chosen day. Escape, or the
 * mouse leaving, goes back to null (today).
 */
export function ScrubChart({
  points,
  index,
  onScrub,
  currency,
  label,
}: {
  points: readonly DayPoint[];
  /** The chosen day, or null for none (today). */
  index: number | null;
  onScrub: (index: number | null) => void;
  currency: string;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  usePrivacy(); // the slider's text uses fmtMoney
  const W = Math.max(200, useSize(wrap, { width: 320, height: 140 }).width);
  const H = 140;
  const pad = 10;
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => p.totalMinor));
  const x = (i: number) => pad + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${Math.round(x(i))},${Math.round(y(p.totalMinor))}`)
    .join(' ');
  const at = index ?? n - 1;
  const p = points[at];
  const text = p
    ? tl(
        '{0}: {1} so far, {2} that day',
        fmtDate(p.date),
        fmtMoney(p.totalMinor, { currency }),
        fmtMoney(p.dayMinor, { currency }),
      )
    : tl('No days yet');

  const fromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad) / Math.max(1, r.width - 2 * pad)) * (n - 1));
    onScrub(Math.max(0, Math.min(n - 1, i)));
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowUp: 1,
    };
    if (step[e.key] !== undefined) {
      e.preventDefault();
      onScrub(Math.max(0, Math.min(n - 1, at + step[e.key]!)));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onScrub(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onScrub(n - 1);
    } else if (e.key === 'Escape' && index !== null) {
      e.preventDefault();
      e.stopPropagation();
      onScrub(null);
    }
  };

  return (
    <div ref={wrap} className="scrub-wrap">
      <svg
        className="scrub-chart"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={Math.max(1, n)}
        aria-valuenow={at + 1}
        aria-valuetext={text}
        data-testid="scrub"
        onKeyDown={onKeyDown}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' || e.buttons > 0) fromPointer(e);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') onScrub(null);
        }}
      >
        <line className="pace-axis" x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} />
        {n > 0 && <path className="scrub-line" d={d} />}
        {p && (
          <>
            <line className="scrub-cursor" x1={x(at)} x2={x(at)} y1={pad} y2={H - pad} />
            <circle className="scrub-dot" cx={x(at)} cy={y(p.totalMinor)} r={4} />
          </>
        )}
      </svg>
    </div>
  );
}
