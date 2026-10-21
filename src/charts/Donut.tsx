import { arc, pie, type PieArcDatum } from 'd3-shape';
import { useState } from 'react';
import { Money, usePrivacy } from '../app/Money';
import type { CategoryTotal } from '../domain/aggregates';
import { categoryById } from '../domain/categories';
import { fmtMoney } from '../domain/money';
import type { Category } from '../domain/types';
import { fillFor, HatchDefs } from './fills';

const SIZE = 220;
const R_OUT = 104;
const R_IN = 70;

interface Props {
  totals: CategoryTotal[];
  categories: readonly Category[];
  currency: string;
  caption: string;
  onSelect: (categoryId: string) => void;
}

/** Spending by category. Hover or focus a slice to see it in the centre; click to open those entries. */
export function Donut({ totals, categories, currency, caption, onSelect }: Props) {
  usePrivacy(); // slice labels are built with fmtMoney, so re-render when privacy changes
  const [active, setActive] = useState<string | null>(null);
  const total = totals.reduce((s, t) => s + t.totalMinor, 0);
  const arcs = pie<CategoryTotal>()
    .value((d) => d.totalMinor)
    .sort(null)
    .padAngle(totals.length > 1 ? 0.012 : 0)(totals);
  const shape = arc<PieArcDatum<CategoryTotal>>().cornerRadius(2);
  const activeTotal = totals.find((t) => t.categoryId === active);
  const name = (id: string) => categoryById(categories, id)?.name ?? 'Other';

  return (
    <div className="donut">
      <div className="donut-figure">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
          role="group"
          aria-label={`Spending by category, ${caption}`}
        >
          <HatchDefs categories={categories} />
          {total === 0 ? (
            <circle
              r={(R_OUT + R_IN) / 2}
              fill="none"
              stroke="var(--fill)"
              strokeWidth={R_OUT - R_IN}
            />
          ) : (
            arcs.map((a) => {
              const id = a.data.categoryId;
              const on = active === id;
              const d = shape({
                ...a,
                innerRadius: R_IN,
                outerRadius: on ? R_OUT + 6 : R_OUT,
              } as PieArcDatum<CategoryTotal> & { innerRadius: number; outerRadius: number });
              return (
                <path
                  key={id}
                  d={d ?? undefined}
                  className="donut-slice"
                  fill={fillFor(categoryById(categories, id))}
                  opacity={active && !on ? 0.35 : 1}
                  tabIndex={0}
                  role="button"
                  aria-label={`${name(id)}, ${fmtMoney(a.data.totalMinor, { currency })}. Show entries`}
                  data-testid={`slice-${id}`}
                  onPointerEnter={() => setActive(id)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(id)}
                  onBlur={() => setActive(null)}
                  onClick={() => onSelect(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(id);
                    }
                  }}
                />
              );
            })
          )}
        </svg>
        <div className="donut-centre" aria-hidden="true">
          <span className="donut-label">
            {activeTotal ? name(activeTotal.categoryId) : caption}
          </span>
          <Money
            className="donut-value"
            minor={activeTotal ? activeTotal.totalMinor : total}
            currency={currency}
          />
        </div>
      </div>
      {total === 0 ? (
        <p className="muted small">Nothing spent yet this month.</p>
      ) : (
        <ul className="legend" aria-label="Categories">
          {totals.map((t) => {
            const c = categoryById(categories, t.categoryId);
            return (
              <li key={t.categoryId}>
                <button
                  type="button"
                  className="legend-item"
                  data-active={active === t.categoryId ? '' : undefined}
                  onPointerEnter={() => setActive(t.categoryId)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(t.categoryId)}
                  onBlur={() => setActive(null)}
                  onClick={() => onSelect(t.categoryId)}
                >
                  <span className="dot" style={{ background: c?.color ?? 'var(--faint)' }} />
                  <span className="legend-name">{name(t.categoryId)}</span>
                  <Money minor={t.totalMinor} currency={currency} />
                  <span className="legend-pct">{Math.round((t.totalMinor / total) * 100)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
