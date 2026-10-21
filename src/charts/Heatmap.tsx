import { usePrivacy } from '../app/Money';
import { diffDays, fmtDate, MONTHS, parseISO, weekdayOf } from '../domain/dates';
import { fmtMoney } from '../domain/money';
import type { DayCell } from '../domain/reports';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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
export function Heatmap({ days, currency }: { days: DayCell[]; currency: string }) {
  usePrivacy(); // labels use fmtMoney
  if (days.length === 0) return null;
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
      monthTicks.push({ x: left + week * (cell + gap), label: MONTHS[p.m - 1]!.slice(0, 3) });
    }
  });

  return (
    <div className="heatmap">
      <svg width={width} height={height} role="group" aria-label="Spending by day">
        {DAYS.map((d, i) =>
          i % 2 === 0 ? (
            <text
              key={d}
              className="hm-axis"
              x={0}
              y={top + i * (cell + gap) + cell / 2}
              dy="0.32em"
            >
              {d}
            </text>
          ) : null,
        )}
        {monthTicks.map((t) => (
          <text key={`${t.label}-${t.x}`} className="hm-axis" x={t.x} y={10}>
            {t.label}
          </text>
        ))}
        {days.map((d) => {
          const i = diffDays(d.date, days[0]!.date) + offset;
          const x = left + Math.floor(i / 7) * (cell + gap);
          const y = top + (i % 7) * (cell + gap);
          const label = `${fmtDate(d.date)}, ${d.totalMinor > 0 ? fmtMoney(d.totalMinor, { currency }) : 'nothing spent'}`;
          return (
            <rect
              key={d.date}
              className={`hm-cell hm-${level(d.totalMinor, cuts)}`}
              x={x}
              y={y}
              width={cell}
              height={cell}
              rx={3}
              role="img"
              aria-label={label}
            >
              <title>{label}</title>
            </rect>
          );
        })}
      </svg>
      <p className="hm-legend muted small" aria-hidden="true">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`hm-swatch hm-${l}`} />
        ))}
        More
      </p>
    </div>
  );
}
