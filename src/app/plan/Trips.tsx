import { useState, type FormEvent } from 'react';
import { useLedger, type ProjectDraft } from '../../data/store';
import { categoryById } from '../../domain/categories';
import { fmtDate, todayISO } from '../../domain/dates';
import {
  MAX_PROJECT_NAME,
  PROJECT_KIND_LABEL,
  projectProblem,
  projectSummary,
  type Project,
  type ProjectKind,
} from '../../domain/projects';
import { AmountInput } from '../AmountInput';
import { Icon } from '../icons';
import { Money } from '../Money';
import { TxList } from '../TxList';

const STATUS_LABEL = { upcoming: 'Coming up', on: 'On now', done: 'Done', open: '' } as const;

function ProjectForm({ initial, onDone }: { initial?: Project; onDone: () => void }) {
  const projects = useLedger((s) => s.projects);
  const saveProject = useLedger((s) => s.saveProject);
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<ProjectKind>(initial?.kind ?? 'trip');
  const [start, setStart] = useState(initial?.start ?? '');
  const [end, setEnd] = useState(initial?.end ?? '');
  const [budget, setBudget] = useState<number | null>(initial?.budgetMinor ?? null);
  const [collect, setCollect] = useState(initial?.collect ?? true);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const draft: ProjectDraft = {
      name,
      kind,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(budget !== null ? { budgetMinor: budget } : {}),
      collect: collect && Boolean(start && end),
      ...(initial?.archived ? { archived: true } : {}),
    };
    const problem = projectProblem({ ...draft, collect }, projects, initial?.id);
    if (problem && !(problem.startsWith('To collect') && !start && !end)) return setError(problem);
    await saveProject(draft, initial?.id);
    onDone();
  };
  const id = initial?.id ?? 'new';
  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`p-name-${id}`}>Name</label>
          <input
            id={`p-name-${id}`}
            className="input"
            autoComplete="off"
            maxLength={MAX_PROJECT_NAME}
            placeholder="Goa trip"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`p-kind-${id}`}>Kind</label>
          <select
            id={`p-kind-${id}`}
            className="select input"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProjectKind)}
          >
            {(Object.keys(PROJECT_KIND_LABEL) as ProjectKind[]).map((k) => (
              <option key={k} value={k}>
                {PROJECT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`p-start-${id}`}>First day (optional)</label>
          <input
            id={`p-start-${id}`}
            className="input"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`p-end-${id}`}>Last day (optional)</label>
          <input
            id={`p-end-${id}`}
            className="input"
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`p-budget-${id}`}>Budget (optional)</label>
          <AmountInput
            id={`p-budget-${id}`}
            initialMinor={initial?.budgetMinor ?? null}
            onChange={setBudget}
          />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={collect} onChange={(e) => setCollect(e.target.checked)} />
        Add entries dated between the first and last day to it by themselves
      </label>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary">
          {initial ? 'Save changes' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const transactions = useLedger((s) => s.transactions);
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const saveProject = useLedger((s) => s.saveProject);
  const deleteProject = useLedger((s) => s.deleteProject);
  const removeTransaction = useLedger((s) => s.removeTransaction);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const s = projectSummary(project, transactions, todayISO());
  const draft: ProjectDraft = {
    name: project.name,
    kind: project.kind,
    start: project.start,
    end: project.end,
    budgetMinor: project.budgetMinor,
    collect: project.collect,
  };
  const titleId = `project-${project.id}`;
  if (editing)
    return (
      <section className="card" aria-label={`Edit ${project.name}`}>
        <ProjectForm initial={project} onDone={() => setEditing(false)} />
      </section>
    );
  const pct =
    project.budgetMinor && project.budgetMinor > 0
      ? Math.min(100, (s.spentMinor / project.budgetMinor) * 100)
      : null;
  return (
    <section className="card" aria-labelledby={titleId} data-testid="project-card">
      <div className="card-head">
        <h2 id={titleId}>{project.name}</h2>
        <span className="muted small">
          {PROJECT_KIND_LABEL[project.kind]}
          {project.start && project.end
            ? `, ${fmtDate(project.start)} to ${fmtDate(project.end)}`
            : ''}
          {STATUS_LABEL[s.status] ? ` · ${STATUS_LABEL[s.status]}` : ''}
        </span>
      </div>
      <p className="big-figure" data-testid="project-spent">
        <Money minor={s.spentMinor} currency={currency} />
      </p>
      <p className="small">
        {s.count === 1 ? '1 entry' : `${s.count} entries`}
        {s.perDayMinor !== null && project.kind === 'trip' && (
          <>
            , <Money minor={s.perDayMinor} currency={currency} /> a day over{' '}
            {s.days === 1 ? '1 day' : `${s.days} days`}
          </>
        )}
        {s.leftMinor !== null && (
          <>
            {'. '}
            {s.leftMinor >= 0 ? (
              <>
                <Money minor={s.leftMinor} currency={currency} /> left of{' '}
                <Money minor={project.budgetMinor!} currency={currency} />
              </>
            ) : (
              <span className="status-over">
                Over by <Money minor={-s.leftMinor} currency={currency} />
              </span>
            )}
          </>
        )}
        .
      </p>
      {pct !== null && (
        <span className="hbar-track project-bar" aria-hidden="true">
          <span className="hbar-fill" style={{ width: `${pct}%` }} />
        </span>
      )}
      {s.byCategory.length > 0 && (
        <ul className="hbars">
          {s.byCategory.slice(0, 5).map((r) => (
            <li key={r.categoryId} className="hbar">
              <span className="hbar-label">
                {categoryById(categories, r.categoryId)?.name ?? 'Other'}
              </span>
              <Money minor={r.totalMinor} currency={currency} />
            </li>
          ))}
        </ul>
      )}
      <div className="btn-row">
        {s.count > 0 && (
          <button
            type="button"
            className="btn"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide entries' : 'Show entries'}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void saveProject({ ...draft, archived: !project.archived }, project.id)}
        >
          {project.archived ? 'Bring back' : 'Archive'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setDeleting((v) => !v)}>
          Delete
        </button>
      </div>
      {deleting && (
        <div className="preview">
          <p className="small">Delete {project.name}? Its entries stay, just without it.</p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void deleteProject(project.id)}
            >
              Delete {project.name}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {open && (
        <TxList
          label={`Entries in ${project.name}`}
          transactions={s.entries}
          onDelete={(id) => void removeTransaction(id)}
          onEdit={setEditingId}
          editingId={editingId}
        />
      )}
    </section>
  );
}

/**
 * Budgets > Trips (Drop 12): trips, projects and festival funds, each with its own budget and total.
 */
export function TripsView() {
  const projects = useLedger((s) => s.projects);
  const [adding, setAdding] = useState(false);
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  return (
    <>
      <section className="card" aria-labelledby="trips-title">
        <div className="card-head">
          <h2 id="trips-title">Trips, projects and festivals</h2>
          {!adding && (
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              <Icon name="plus" />
              Add one
            </button>
          )}
        </div>
        {!adding && active.length === 0 && (
          <p className="muted small">
            Going to Goa, doing up the kitchen, or planning Diwali? Add it here with dates and a
            budget. While it is on, what you log joins it by itself; you can also add entries from
            the form or from Transactions.
          </p>
        )}
        {adding && <ProjectForm onDone={() => setAdding(false)} />}
      </section>
      {active.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
      {archived.length > 0 && (
        <details className="card archived-projects">
          <summary>Archived ({archived.length})</summary>
          {archived.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </details>
      )}
    </>
  );
}
