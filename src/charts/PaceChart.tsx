import { useRef } from 'react';
import type { PacePoint } from '../domain/plan';
import { useSize } from './useSize';

/**
 * Spending added up day by day (solid) against a straight line to the budget (dashed). The caption
 * under it carries the numbers; `label` describes it for screen readers.
 */
export function PaceChart({ points, label }: { points: readonly PacePoint[]; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  // Drawn at the width it is shown at, so the lines keep their thickness and the chart fills the card.
  const W = Math.max(200, useSize(wrap, { width: 320, height: 160 }).width);
  const H = 160;
  const pad = 8;
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => Math.max(p.idealMinor, p.actualMinor ?? 0)));
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const actual = points.filter((p) => p.actualMinor !== null);
  const last = actual[actual.length - 1];
  const lastIndex = actual.length - 1;
  const over = last ? (last.actualMinor ?? 0) > last.idealMinor : false;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const line = (pts: Array<[number, number]>) =>
    pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${r1(px)},${r1(py)}`).join(' ');
  return (
    <div ref={wrap} className="pace-wrap">
      <svg
        className="pace-chart"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        focusable="false"
      >
        <line className="pace-axis" x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} />
        {n > 0 && (
          <path
            className="pace-ideal"
            d={line([
              [x(0), y(0)],
              [x(n - 1), y(points[n - 1]!.idealMinor)],
            ])}
          />
        )}
        {actual.length > 0 && (
          <path
            className={over ? 'pace-actual pace-over' : 'pace-actual'}
            d={line([
              [x(0), y(0)],
              ...actual.map((p, i): [number, number] => [x(i), y(p.actualMinor!)]),
            ])}
          />
        )}
        {last && (
          <circle
            className={over ? 'pace-dot pace-over' : 'pace-dot'}
            cx={x(lastIndex)}
            cy={y(last.actualMinor!)}
            r={4}
          />
        )}
      </svg>
    </div>
  );
}
