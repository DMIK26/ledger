import { useState, type FormEvent } from 'react';
import { useLedger } from '../../data/store';
import { MAX_SUBCATEGORY_NAME, subcategoryNameProblem } from '../../domain/subcategories';
import type { Category, Subcategory } from '../../domain/types';
import { tl } from '../../domain/i18n';

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
          {tl('Name of {0}', sub.name)}
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
      <span className="muted small">
        {entries === 1 ? tl('1 entry') : tl('{0} entries', entries)}
      </span>
      <button
        type="button"
        className="btn btn-ghost"
        aria-label={tl('Delete {0}', sub.name)}
        title={tl('Its entries stay in the category')}
        onClick={() => void deleteSubcategory(c.id, sub.id)}
      >
        {tl('Delete')}
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
          ? tl('Subcategories')
          : tl('Subcategories ({0}): {1}', subs.length, subs.map((s) => s.name).join(', '))}
      </button>
      {open && subs.length > 0 && (
        <ul className="sub-list" aria-label={tl('Subcategories of {0}', c.name)}>
          {subs.map((s) => (
            <SubRow key={s.id} c={c} sub={s} />
          ))}
        </ul>
      )}
      {open && (
        <form className="bulk-tag" onSubmit={add}>
          <label className="visually-hidden" htmlFor={`sub-new-${c.id}`}>
            {tl('New subcategory of {0}', c.name)}
          </label>
          <input
            id={`sub-new-${c.id}`}
            className="input"
            placeholder={tl('New subcategory')}
            autoComplete="off"
            maxLength={MAX_SUBCATEGORY_NAME}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn">
            {tl('Add')}
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
