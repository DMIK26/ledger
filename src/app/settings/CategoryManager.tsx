import { useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { useLedger } from '../../data/store';
import {
  CATEGORY_PALETTE,
  categoryNameProblem,
  isDefaultCategory,
  OTHER_ID,
} from '../../domain/categories';
import type { Category } from '../../domain/types';
import { tick } from '../../kit/haptics';

const COLOUR_NAMES = [
  'Clay',
  'Sky',
  'Olive',
  'Sand',
  'Rose',
  'Navy',
  'Rust',
  'Lavender',
  'Teal',
  'Grey',
];

function Row({
  c,
  index,
  count,
  dropping,
  onHandleDown,
  onHandleMove,
  onHandleUp,
}: {
  c: Category;
  index: number;
  count: number;
  dropping: boolean;
  onHandleDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onHandleMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onHandleUp: () => void;
}) {
  const categories = useLedger((s) => s.categories);
  const entries = useLedger((s) => s.transactions.filter((t) => t.categoryId === c.id).length);
  const renameCategory = useLedger((s) => s.renameCategory);
  const recolorCategory = useLedger((s) => s.recolorCategory);
  const moveCategory = useLedger((s) => s.moveCategory);
  const deleteCategory = useLedger((s) => s.deleteCategory);
  const [name, setName] = useState(c.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [colours, setColours] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState(OTHER_ID);
  const fixed = isDefaultCategory(c.id);

  const saveName = () => {
    if (name.trim() === c.name) return setNameError(null);
    const problem = categoryNameProblem(name, categories, c.id);
    setNameError(problem);
    if (!problem) void renameCategory(c.id, name);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const to = index + step;
    if (to >= 0 && to < count) void moveCategory(c.id, to);
  };

  return (
    <li className="cat-row" data-drop={dropping ? '' : undefined} data-testid={`cat-${c.id}`}>
      <button
        type="button"
        className="btn btn-ghost btn-icon drag-handle"
        aria-label={`Move ${c.name}. Drag, or use the up and down arrow keys`}
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onKeyDown={onKey}
      >
        <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true" className="grip">
          {[3, 8, 13].map((y) => (
            <g key={y}>
              <circle cx="3" cy={y} r="1.5" />
              <circle cx="9" cy={y} r="1.5" />
            </g>
          ))}
        </svg>
      </button>
      <button
        type="button"
        className="swatch-button"
        style={{ background: c.color }}
        aria-label={`Colour for ${c.name}`}
        aria-expanded={colours}
        onClick={() => setColours((v) => !v)}
      />
      {fixed ? (
        <span className="cat-name">{c.name}</span>
      ) : (
        <form
          className="cat-name"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            saveName();
          }}
        >
          <label className="visually-hidden" htmlFor={`cat-name-${c.id}`}>
            Name
          </label>
          <input
            id={`cat-name-${c.id}`}
            className="input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
          />
        </form>
      )}
      <span className="muted small cat-count">
        {entries === 1 ? '1 entry' : `${entries} entries`}
      </span>
      {!fixed && (
        <button type="button" className="btn btn-ghost" onClick={() => setDeleting((v) => !v)}>
          Delete
        </button>
      )}
      {nameError && (
        <p className="errors cat-wide" role="alert">
          {nameError}
        </p>
      )}
      {colours && (
        <div className="swatches cat-wide" role="radiogroup" aria-label={`Colour for ${c.name}`}>
          {CATEGORY_PALETTE.map((color, i) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={c.color === color}
              aria-label={COLOUR_NAMES[i] ?? color}
              className="swatch"
              style={{ background: color }}
              onClick={() => void recolorCategory(c.id, color)}
            />
          ))}
          <span className="muted small">A colour in use swaps with that category.</span>
        </div>
      )}
      {deleting && (
        <div className="preview cat-wide">
          <label htmlFor={`move-${c.id}`}>
            {entries > 0
              ? `Move its ${entries === 1 ? 'entry' : `${entries} entries`}, rules and budgets to`
              : 'Move any rules and budgets to'}
          </label>
          <div className="btn-row">
            <select
              id={`move-${c.id}`}
              className="select input"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
            >
              {categories
                .filter((x) => x.id !== c.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void deleteCategory(c.id, moveTo)}
            >
              Delete {c.name}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Categories: reorder by dragging (or arrow keys on the handle), recolour, add and rename your own.
 * The ten defaults keep their names. Deleting always asks where the entries go.
 */
export function CategoryManager() {
  const categories = useLedger((s) => s.categories);
  const addCategory = useLedger((s) => s.addCategory);
  const moveCategory = useLedger((s) => s.moveCategory);
  const list = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ id: string; target: number } | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const targetAt = (clientY: number, id: string): number => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>(':scope > .cat-row') ?? [])];
    const others = rows.filter((_, i) => categories[i]?.id !== id);
    return others.filter((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2 < clientY;
    }).length;
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const problem = categoryNameProblem(name, categories);
    setError(problem);
    if (problem) return;
    await addCategory(name);
    setName('');
  };

  // The drop line shows above the row the dragged one will land before.
  const others = drag ? categories.filter((c) => c.id !== drag.id) : [];
  const dropBefore = drag ? others[drag.target]?.id : undefined;

  return (
    <section className="card" aria-labelledby="cats-manager-title">
      <h2 id="cats-manager-title">Categories</h2>
      <p className="muted small">
        Drag the handle to reorder. The ten built-in categories keep their names; your own can be
        renamed or deleted.
      </p>
      <ul className="cat-list" ref={list} data-dragging={drag ? '' : undefined}>
        {categories.map((c, i) => (
          <Row
            key={`${c.id}-${c.name}`}
            c={c}
            index={i}
            count={categories.length}
            dropping={dropBefore === c.id}
            onHandleDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              setDrag({ id: c.id, target: i });
            }}
            onHandleMove={(e) => {
              if (!drag) return;
              const target = targetAt(e.clientY, drag.id);
              if (target !== drag.target) {
                tick();
                setDrag({ ...drag, target });
              }
            }}
            onHandleUp={() => {
              if (!drag) return;
              const { id, target } = drag;
              setDrag(null);
              if (categories.findIndex((x) => x.id === id) !== target)
                void moveCategory(id, target);
            }}
          />
        ))}
      </ul>
      <form className="bulk-tag" onSubmit={(e) => void add(e)}>
        <label className="visually-hidden" htmlFor="new-category">
          New category name
        </label>
        <input
          id="new-category"
          className="input"
          placeholder="New category"
          maxLength={40}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        <button type="submit" className="btn">
          Add category
        </button>
      </form>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
