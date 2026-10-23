import { useState, type FormEvent } from 'react';
import { useLedger } from '../../data/store';
import { MAX_SUBCATEGORY_NAME, subcategoryNameProblem } from '../../domain/subcategories';
import type { Category, Subcategory } from '../../domain/types';

function SubRow({ c, sub }: { c: Category; sub: Subcategory }) {
  const saveSubcategory = useLedger((s) => s.saveSubcategory);
  const deleteSubcategory = useLedger((s) => s.deleteSubcategory);
  const entries = useLedger((s) => s.transactions.filter((t) => t.subcategoryId === sub.id).length);
  const [name, setName] = useState(sub.name);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    if (name.trim() === sub.name) return setError(null);
    const problem = subcategoryNameProblem(name, c, sub.id);
    setError(problem);
    if (!problem) void saveSubcategory(c.id, name, sub.id);
  };
  return (
    <li className="sub-row" data-testid={`sub-${sub.id}`}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="visually-hidden" htmlFor={`sub-name-${sub.id}`}>
          Name of {sub.name}
        </label>
        <input
          id={`sub-name-${sub.id}`}
          className="input"
          value={name}
          maxLength={MAX_SUBCATEGORY_NAME}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
        />
      </form>
      <span className="muted small">{entries === 1 ? '1 entry' : `${entries} entries`}</span>
      <button
        type="button"
        className="btn btn-ghost"
        aria-label={`Delete ${sub.name}`}
        title="Its entries stay in the category"
        onClick={() => void deleteSubcategory(c.id, sub.id)}
      >
        Delete
      </button>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** A category's subcategories (Drop 12): add, rename, delete. Their entries always stay in the category. */
export function Subcategories({ c }: { c: Category }) {
  const saveSubcategory = useLedger((s) => s.saveSubcategory);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const subs = c.subcategories ?? [];
  const add = (e: FormEvent) => {
    e.preventDefault();
    const problem = subcategoryNameProblem(name, c);
    setError(problem);
    if (problem) return;
    void saveSubcategory(c.id, name);
    setName('');
  };
  return (
    <div className="subcats cat-wide">
      <button
        type="button"
        className="btn btn-ghost subcats-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {subs.length === 0
          ? 'Subcategories'
          : `Subcategories (${subs.length}): ${subs.map((s) => s.name).join(', ')}`}
      </button>
      {open && subs.length > 0 && (
        <ul className="sub-list" aria-label={`Subcategories of ${c.name}`}>
          {subs.map((s) => (
            <SubRow key={s.id} c={c} sub={s} />
          ))}
        </ul>
      )}
      {open && (
        <form className="bulk-tag" onSubmit={add}>
          <label className="visually-hidden" htmlFor={`sub-new-${c.id}`}>
            New subcategory of {c.name}
          </label>
          <input
            id={`sub-new-${c.id}`}
            className="input"
            placeholder="New subcategory"
            autoComplete="off"
            maxLength={MAX_SUBCATEGORY_NAME}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn">
            Add
          </button>
        </form>
      )}
      {open && error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
