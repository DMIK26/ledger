import { useRef } from 'react';
import { Money, usePrivacy } from '../app/Money';
import type { FlowNode, MoneyFlow } from '../domain/flow';
import { fmtMoney } from '../domain/money';
import { useSize } from './useSize';

const NODE_W = 10;
const GAP = 8;

interface Placed extends FlowNode {
  x: number;
  y: number;
  h: number;
}

/**
 * Money flow (Drop 11, a Sankey after Monarch): money in on the left, categories and what was left in
 * the middle, one chosen category's merchants on the right. Bands are flat colour at low opacity.
 * The table under it says the same in words.
 */
export function FlowChart({
  flow,
  colorOf,
  currency,
  expanded,
  onExpand,
}: {
  flow: MoneyFlow;
  colorOf: (node: FlowNode) => string;
  currency: string;
  expanded: string | null;
  onExpand: (categoryId: string | null) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  usePrivacy();
  const W = Math.max(280, useSize(wrap, { width: 560, height: 300 }).width);
  const H = 300;
  const columns = flow.nodes.some((n) => n.column === 2) ? 3 : 2;
  const colX = (c: number) =>
    c === 0 ? 0 : c === 1 ? (columns === 3 ? W * 0.42 : W - NODE_W - 150) : W - NODE_W - 130;
  const placed = new Map<string, Placed>();
  for (let c = 0; c < columns; c += 1) {
    const nodes = flow.nodes.filter((n) => n.column === c);
    const total = nodes.reduce((s, n) => s + n.valueMinor, 0);
    const usable = H - GAP * Math.max(0, nodes.length - 1);
    let y = 0;
    for (const n of nodes) {
      const h = total > 0 ? Math.max(2, (n.valueMinor / total) * usable) : 0;
      placed.set(n.id, { ...n, x: colX(c), y, h });
      y += h + GAP;
    }
  }
  // Where each band leaves its source and enters its target.
  const outY = new Map<string, number>();
  const inY = new Map<string, number>();
  const bands = flow.links
    .filter((l) => l.valueMinor > 0)
    .map((l) => {
      const s = placed.get(l.source)!;
      const t = placed.get(l.target)!;
      const hs = s.valueMinor > 0 ? (l.valueMinor / s.valueMinor) * s.h : 0;
      const ht = t.valueMinor > 0 ? (l.valueMinor / t.valueMinor) * t.h : 0;
      const sy = outY.get(s.id) ?? s.y;
      const ty = inY.get(t.id) ?? t.y;
      outY.set(s.id, sy + hs);
      inY.set(t.id, ty + ht);
      const x0 = s.x + NODE_W;
      const x1 = t.x;
      const mx = (x0 + x1) / 2;
      const d = `M${x0},${sy}C${mx},${sy} ${mx},${ty} ${x1},${ty}L${x1},${ty + ht}C${mx},${ty + ht} ${mx},${sy + hs} ${x0},${sy + hs}Z`;
      return { key: `${l.source}>${l.target}`, d, color: colorOf(t) };
    });
  const nameOf = (id: string) => placed.get(id)?.label ?? id;

  return (
    <div className="flow-block">
      <div ref={wrap} className="flow-wrap">
        <svg
          className="flow"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
          focusable="false"
        >
          {bands.map((b) => (
            <path key={b.key} className="flow-band" d={b.d} fill={b.color} />
          ))}
          {[...placed.values()].map((n) => (
            <g
              key={n.id}
              className={n.kind === 'category' ? 'flow-node flow-pick' : 'flow-node'}
              onClick={() =>
                n.kind === 'category' && onExpand(expanded === n.categoryId ? null : n.categoryId!)
              }
            >
              <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx={2} fill={colorOf(n)} />
              {n.h >= 12 && (
                <text
                  className="flow-label"
                  x={n.column === 0 ? n.x + NODE_W + 6 : n.x + NODE_W + 6}
                  y={n.y + n.h / 2}
                  dominantBaseline="middle"
                >
                  {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
                  <title>{`${n.label}, ${fmtMoney(n.valueMinor, { currency })}`}</title>
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Money flow as a table">
        <table className="report-table flow-table">
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col" className="num">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {flow.links
              .filter((l) => l.valueMinor > 0)
              .map((l) => (
                <tr key={`${l.source}>${l.target}`}>
                  <td>{nameOf(l.source)}</td>
                  <td>{nameOf(l.target)}</td>
                  <td className="num">
                    <Money minor={l.valueMinor} currency={currency} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="flow-pick-row" role="group" aria-label="Show a category's merchants">
        {flow.nodes
          .filter((n) => n.kind === 'category')
          .map((n) => (
            <button
              key={n.id}
              type="button"
              className="chip"
              aria-pressed={expanded === n.categoryId}
              onClick={() => onExpand(expanded === n.categoryId ? null : n.categoryId!)}
            >
              <span className="dot" style={{ background: colorOf(n) }} />
              {n.label}
            </button>
          ))}
      </div>
    </div>
  );
}
