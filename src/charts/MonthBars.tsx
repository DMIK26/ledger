import { MoodFaceG, MOOD_OF } from '../doodle/faces';
import { budgetStatus } from '../domain/budgets';
import { scaleBand, scaleLinear } from 'd3-scale';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Money, usePrivacy } from '../app/Money';
import type { MonthPoint } from '../domain/aggregates';
import { BUDGET_STEP, snapToStep } from '../domain/budgets';
import { monthLabel } from '../domain/dates';
import { fmtMoney } from '../domain/money';
import type { Category } from '../domain/types';
import { entityKey } from '../kit/entityKeys';
import { tick } from '../kit/haptics';
import { useRoving } from '../kit/roving';
import { createSpring2D } from '../kit/spring';
import { fillFor, HatchDefs } from './fills';
import { useSize } from './useSize';

export type BarMode = 'total' | 'category';

interface Props {
  series: MonthPoint[];
  categories: readonly Category[];
  currency: string;
  mode: BarMode;
  /** The current month's overall budget, drawn as a draggable line. Null hides it. */
  budgetMinor: number | null;
  onBudgetChange: (minor: number) => Promise<void> | void;
  /** The month the switcher is on; drawn darker in Total mode. */
  selectedMonth?: string;
  /** Hovering or focusing a month previews it elsewhere (the donut). */
  onHoverMonth?: (month: string | null) => void;
  /** Clicking a month (or Enter) switches the whole app to it. */
  onSelectMonth?: (month: string) => void;
}

const MIN_HEIGHT = 220;
const M = { top: 16, right: 16, bottom: 28, left: 52 };

const shortMonth = (key: string) => monthLabel(key).slice(0, 3);

export function MonthBars({
  series,
  categories,
  currency,
  mode,
  budgetMinor,
  onBudgetChange,
  selectedMonth,
  onHoverMonth,
  onSelectMonth,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const size = useSize(wrap);
  const width = size.width;
  const HEIGHT = Math.max(MIN_HEIGHT, size.height);
  const masked = usePrivacy();
  const [hover, setHoverState] = useState<string | null>(null);
  const setHover = (m: string | null) => {
    setHoverState(m);
    onHoverMonth?.(m);
  };
  const roving = useRoving(series.length);
  const tag = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<number | null>(null);
  // Holds the dropped value until the saved budget arrives, so the line never jumps back.
  const [pending, setPending] = useState<number | null>(null);
  const [frozenMax, setFrozenMax] = useState<number | null>(null);

  const budget = draft ?? pending ?? budgetMinor;
  const dataMax = Math.max(
    0,
    ...series.map((p) => p.totalMinor),
    budgetMinor ?? 0,
    BUDGET_STEP * 4,
  );
  const y = scaleLinear()
    .domain([0, frozenMax ?? dataMax * 1.1])
    .nice(4)
    .range([HEIGHT - M.bottom, M.top]);
  const x = scaleBand<string>()
    .domain(series.map((p) => p.month))
    .range([M.left, Math.max(M.left + 60, width - M.right)])
    .padding(0.35);
  const yMax = y.domain()[1] ?? 0;
  const current = selectedMonth ?? series[series.length - 1]?.month;

  const valueAt = (clientY: number): number => {
    const top = svg.current?.getBoundingClientRect().top ?? 0;
    return Math.min(yMax, snapToStep(y.invert(clientY - top)));
  };

  const onPointerDown = (e: PointerEvent<SVGGElement>) => {
    if (budgetMinor === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setFrozenMax(yMax);
    setDraft(valueAt(e.clientY));
  };
  const onPointerMove = (e: PointerEvent<SVGGElement>) => {
    if (draft === null) return;
    const v = valueAt(e.clientY);
    if (v !== draft) tick();
    setDraft(v);
  };
  const finishDrag = () => {
    if (draft === null) return;
    const v = draft;
    setDraft(null);
    setFrozenMax(null);
    if (v === budgetMinor) return;
    setPending(v);
    void Promise.resolve(onBudgetChange(v)).finally(() => setPending(null));
  };
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (budgetMinor === null) return;
    const steps: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 10,
      PageDown: -10,
    };
    const n = steps[e.key];
    if (n === undefined) return;
    e.preventDefault();
    onBudgetChange(snapToStep(budgetMinor + n * BUDGET_STEP));
  };

  const hovered = series.find((p) => p.month === hover);
  const tagTop = budget !== null ? y(budget) - 30 : 0;
  // The budget label follows the line on a spring while dragging.
  const spring = useRef<ReturnType<typeof createSpring2D> | null>(null);
  useEffect(() => {
    const sp = createSpring2D((_, top) => {
      if (tag.current) tag.current.style.top = `${top}px`;
    });
    spring.current = sp;
    return () => sp.stop();
  }, []);
  useEffect(() => {
    spring.current?.set(0, tagTop);
  }, [tagTop, budget]);
  const ordered = [...categories].sort((a, b) => a.order - b.order);

  return (
    <div className="bars" ref={wrap}>
      <svg
        ref={svg}
        width={width}
        height={HEIGHT}
        className={`bars-svg bars-${mode}`}
        role="group"
        aria-label="Spending in the last six months. Use the arrow keys to move between months and Enter to open one."
        data-roving-group=""
      >
        <HatchDefs categories={categories} />
        {y.ticks(4).map((t) => (
          <g key={t} className="tick">
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {fmtMoney(t, { currency, compact: true })}
            </text>
          </g>
        ))}
        {hovered && (
          <line
            className="crosshair"
            x1={(x(hovered.month) ?? 0) + x.bandwidth() / 2}
            x2={(x(hovered.month) ?? 0) + x.bandwidth() / 2}
            y1={M.top}
            y2={HEIGHT - M.bottom}
          />
        )}
        {series.map((p, i) => {
          const x0 = x(p.month) ?? 0;
          let acc = 0;
          const rv = roving.props(i);
          return (
            <g
              key={p.month}
              className="bar"
              role="button"
              aria-pressed={p.month === current}
              aria-label={`${monthLabel(p.month)}, ${fmtMoney(p.totalMinor, { currency })}. Open this month`}
              data-testid={`bar-${p.month}`}
              data-anchor={`month:${p.month}`}
              {...rv}
              onPointerEnter={() => setHover(p.month)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => {
                rv.onFocus();
                setHover(p.month);
              }}
              onBlur={() => setHover(null)}
              onClick={() => onSelectMonth?.(p.month)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectMonth?.(p.month);
                } else rv.onKeyDown(e);
              }}
            >
              <rect
                className="bar-hit"
                x={x0 - (x.step() * x.paddingInner()) / 2}
                y={M.top}
                width={x.step()}
                height={HEIGHT - M.top - M.bottom}
                data-hover={hover === p.month ? '' : undefined}
              />
              {ordered.map((c) => {
                const v = p.byCategory[c.id] ?? 0;
                if (v <= 0) return null;
                const top = y(acc + v);
                const h = y(acc) - top;
                acc += v;
                const key = entityKey('category', c.id);
                return (
                  <rect
                    key={c.id}
                    className="bar-seg"
                    // Hovering a segment highlights its category only when categories are shown.
                    // In Total mode a bar is the month (it previews the donut instead), so it must
                    // not highlight, and dim the donut around, whichever category is under the
                    // pointer. The category stays in data-entity so donut hovers still light it.
                    data-hl={mode === 'category' ? key : undefined}
                    data-entity={`${key} ${entityKey('month', p.month)}`}
                    x={x0}
                    y={top}
                    width={x.bandwidth()}
                    height={Math.max(0, h)}
                    style={{
                      fill:
                        mode === 'category'
                          ? fillFor(c)
                          : p.month === current
                            ? 'var(--text)'
                            : 'var(--faint)',
                    }}
                  />
                );
              })}
              <text
                className="bar-label"
                x={x0 + x.bandwidth() / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
              >
                {shortMonth(p.month)}
              </text>
              {budget !== null && p.totalMinor > 0 && (
                <MoodFaceG
                  mood={MOOD_OF[budgetStatus(p.totalMinor, budget).kind]}
                  x={x0 + x.bandwidth() / 2}
                  y={Math.max(M.top + 2, y(p.totalMinor) - 12)}
                />
              )}
            </g>
          );
        })}
        {budget !== null && (
          <g
            className="budget-line"
            data-dragging={draft !== null ? '' : undefined}
            tabIndex={0}
            role="slider"
            aria-label="Monthly budget. Drag, or use the arrow keys, to change it in steps of 500"
            aria-valuetext={fmtMoney(budget, { currency })}
            aria-valuemin={masked ? undefined : 0}
            aria-valuemax={masked ? undefined : Math.round(yMax / 100)}
            aria-valuenow={masked ? undefined : Math.round(budget / 100)}
            data-testid="budget-line"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onKeyDown={onKeyDown}
          >
            <line x1={M.left} x2={width - M.right} y1={y(budget)} y2={y(budget)} />
            <rect
              className="budget-hit"
              x={M.left}
              y={y(budget) - 12}
              width={Math.max(0, width - M.right - M.left)}
              height={24}
            />
            <circle cx={width - M.right - 6} cy={y(budget)} r={7} />
          </g>
        )}
      </svg>
      {budget !== null && (
        <div className="budget-tag" ref={tag} aria-hidden="true">
          Budget <Money minor={budget} currency={currency} />
        </div>
      )}
      {hovered && (
        <div
          className="bars-tip"
          role="status"
          style={{
            left: Math.min(
              Math.max(8, (x(hovered.month) ?? 0) + x.bandwidth() / 2 - 90),
              width - 188,
            ),
          }}
        >
          <strong>{monthLabel(hovered.month)}</strong>
          <Money minor={hovered.totalMinor} currency={currency} />
          {mode === 'category' &&
            Object.entries(hovered.byCategory)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([id, v]) => (
                <span key={id} className="tip-row">
                  <span>{categories.find((c) => c.id === id)?.name ?? 'Other'}</span>
                  <Money minor={v} currency={currency} />
                </span>
              ))}
        </div>
      )}
    </div>
  );
}
