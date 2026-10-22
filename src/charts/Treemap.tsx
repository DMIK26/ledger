import { useRef } from 'react';
import { Money, usePrivacy } from '../app/Money';
import { fmtMoney } from '../domain/money';
import { squarify } from '../domain/treemap';
import { useSize } from './useSize';

export interface TreeTile {
  id: string;
  label: string;
  valueMinor: number;
  color: string;
}

/**
 * A treemap (Drop 11, after Monarch): areas sized by spending, with the same items listed under it.
 * The list carries the names and amounts and is what keyboards and screen readers use; the tiles are
 * for the eye (and the mouse or finger).
 */
export function Treemap({
  tiles,
  currency,
  onPick,
  label,
}: {
  tiles: readonly TreeTile[];
  currency: string;
  /** Choosing a tile; omit when tiles cannot be opened further. */
  onPick?: (id: string) => void;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  usePrivacy(); // tile tooltips use fmtMoney
  const W = Math.max(240, useSize(wrap, { width: 560, height: 260 }).width);
  const H = Math.round(Math.min(300, Math.max(180, W * 0.45)));
  const total = tiles.reduce((s, t) => s + t.valueMinor, 0);
  const rects = squarify(
    tiles.map((t) => ({ id: t.id, value: t.valueMinor })),
    0,
    0,
    W,
    H,
  );
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return (
    <div className="treemap-block">
      <div ref={wrap} className="treemap-wrap">
        <svg
          className="treemap"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
          focusable="false"
        >
          {rects.map((r) => {
            const t = byId.get(r.id)!;
            return (
              <rect
                key={r.id}
                className={onPick ? 'tree-tile tree-pick' : 'tree-tile'}
                data-testid={`tile-${r.id}`}
                x={r.x + 1}
                y={r.y + 1}
                width={Math.max(0, r.w - 2)}
                height={Math.max(0, r.h - 2)}
                rx={4}
                fill={t.color}
                onClick={() => onPick?.(r.id)}
              >
                <title>{`${t.label}, ${fmtMoney(t.valueMinor, { currency })}, ${share(t.valueMinor)}%`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <ul className="tree-legend" aria-label={label}>
        {tiles.map((t) => {
          const body = (
            <>
              <span className="dot" style={{ background: t.color }} />
              <span className="tree-name">{t.label}</span>
              <Money minor={t.valueMinor} currency={currency} />
              <span className="muted small">{share(t.valueMinor)}%</span>
            </>
          );
          return (
            <li key={t.id}>
              {onPick ? (
                <button type="button" className="tree-item" onClick={() => onPick(t.id)}>
                  {body}
                </button>
              ) : (
                <span className="tree-item">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
