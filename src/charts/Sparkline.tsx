import { linearScale } from './scale';
import { line } from 'd3-shape';

/** A tiny trend line. Decorative: the table next to it carries the numbers. */
export function Sparkline({ values, color = 'var(--text)' }: { values: number[]; color?: string }) {
  const w = 96;
  const h = 24;
  const max = Math.max(1, ...values);
  const x = linearScale([0, Math.max(1, values.length - 1)], [2, w - 2]);
  const y = linearScale([0, max], [h - 3, 3]);
  const d = line<number>()
    .x((_, i) => x(i))
    .y((v) => y(v))(values);
  const last = values.length - 1;
  return (
    <svg className="sparkline" width={w} height={h} aria-hidden="true" focusable="false">
      <path
        d={d ?? undefined}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {last >= 0 && <circle cx={x(last)} cy={y(values[last]!)} r={2.5} fill={color} />}
    </svg>
  );
}
