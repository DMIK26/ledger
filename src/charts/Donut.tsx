import { arc, pie, type PieArcDatum } from 'd3-shape';
import { Money, usePrivacy } from '../app/Money';
import type { CategoryTotal } from '../domain/aggregates';
import { categoryById } from '../domain/categories';
import { fmtMoney } from '../domain/money';
import type { Category } from '../domain/types';
import { useHighlight } from '../kit/entityBus';
import { entityKey } from '../kit/entityKeys';
import { useRoving } from '../kit/roving';
import { fillFor, HatchDefs } from './fills';

const SIZE = 220;
const R_OUT = 104;
const R_IN = 70;

interface Props {
  totals: CategoryTotal[];
  categories: readonly Category[];
  currency: string;
  caption: string;
  /** The category drilled into, drawn raised. */
  selected?: string | null;
  onSelect: (categoryId: string) => void;
  /** Hide the legend (when a breakdown takes its place). */
  legend?: boolean;
  /**
   * The legend's rows, in order. Giving a fixed set keeps the legend (and so the card) the same height
   * while `totals` changes, for example while another month is previewed; rows with nothing show a
   * dash. Without it the legend lists `totals`.
   */
  legendIds?: readonly string[];
}

/**
 * Spending by category. Hovering or focusing a slice, a legend row, or anything else of that category
 * on the page highlights it everywhere and shows it in the centre. Click or Enter drills in. Arrow
 * keys move between slices.
 */
export function Donut({
  totals,
  categories,
  currency,
  caption,
  selected = null,
  onSelect,
  legend = true,
  legendIds,
}: Props) {
  usePrivacy(); // slice labels are built with fmtMoney, so re-render when privacy changes
  const highlight = useHighlight();
  const roving = useRoving(totals.length);
  const hovered = highlight?.startsWith('category:') ? highlight.slice(9) : null;
  const active = totals.some((t) => t.categoryId === hovered) ? hovered : selected;
  const total = totals.reduce((s, t) => s + t.totalMinor, 0);
  const arcs = pie<CategoryTotal>()
    .value((d) => d.totalMinor)
    .sort(null)
    .padAngle(totals.length > 1 ? 0.012 : 0)(totals);
  const shape = arc<PieArcDatum<CategoryTotal>>().cornerRadius(2);
  const activeTotal = totals.find((t) => t.categoryId === active);
  const name = (id: string) => categoryById(categories, id)?.name ?? 'Other';
  const byId = new Map(totals.map((t) => [t.categoryId, t.totalMinor]));
  const rows = legendIds ?? totals.map((t) => t.categoryId);

  return (
    <div className="donut">
      <div className="donut-figure">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
          role="group"
          aria-label={`Spending by category, ${caption}. Use the arrow keys to move between slices.`}
          data-roving-group=""
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
            arcs.map((a, i) => {
              const id = a.data.categoryId;
              const key = entityKey('category', id);
              const raised = active === id;
              const d = shape({
                ...a,
                innerRadius: R_IN,
                outerRadius: raised ? R_OUT + 6 : R_OUT,
              } as PieArcDatum<CategoryTotal> & { innerRadius: number; outerRadius: number });
              const rv = roving.props(i);
              return (
                <path
                  key={id}
                  d={d ?? undefined}
                  className="donut-slice"
                  fill={fillFor(categoryById(categories, id))}
                  role="button"
                  aria-label={`${name(id)}, ${fmtMoney(a.data.totalMinor, { currency })}. Show breakdown`}
                  aria-pressed={selected === id}
                  data-testid={`slice-${id}`}
                  data-anchor={`category:${id}`}
                  data-hl={key}
                  data-entity={key}
                  {...rv}
                  onClick={() => onSelect(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(id);
                    } else rv.onKeyDown(e);
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
      {legend && rows.length > 0 && (
        <ul className="legend" aria-label="Categories">
          {rows.map((id) => {
            const c = categoryById(categories, id);
            const key = entityKey('category', id);
            const value = byId.get(id) ?? 0;
            return (
              <li key={id}>
                <button
                  type="button"
                  className="legend-item"
                  data-active={active === id ? '' : undefined}
                  data-hl={key}
                  data-entity={key}
                  disabled={value === 0}
                  onClick={() => onSelect(id)}
                >
                  <span className="dot" style={{ background: c?.color ?? 'var(--faint)' }} />
                  <span className="legend-name">{name(id)}</span>
                  {value > 0 ? (
                    <Money minor={value} currency={currency} />
                  ) : (
                    <span className="muted" aria-label="nothing">
                      –
                    </span>
                  )}
                  <span className="legend-pct">
                    {value > 0 ? `${Math.round((value / total) * 100)}%` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {legend && rows.length === 0 && <p className="muted small">Nothing spent in this month.</p>}
    </div>
  );
}
