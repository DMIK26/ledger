import { useState, type FormEvent } from 'react';
import { useLedger, type GoalDraft } from '../../data/store';
import { addDays, fmtDate, monthKey, parseISO, todayISO } from '../../domain/dates';
import {
  GOAL_KIND_LABEL,
  GOAL_STATE_LABEL,
  goalState,
  jarFill,
  MAX_GOAL_NAME,
  monthlyNeed,
  savedMinor,
  savedThisMonth,
  sortGoals,
  type Goal,
  type GoalKind,
} from '../../domain/goals';
import { AmountInput } from '../AmountInput';
import { Icon } from '../icons';
import { Money } from '../Money';

/** A drawn jar that fills as money is put aside. Decorative; the text beside it has the numbers. */
function Jar({ id, fill }: { id: string; fill: number }) {
  const top = 16;
  const bottom = 68;
  const level = bottom - (bottom - top) * Math.max(0, Math.min(1, fill));
  const clip = `jar-${id}`;
  return (
    <svg className="jar" viewBox="0 0 60 72" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <rect x="9" y={top} width="42" height={bottom - top} rx="10" />
        </clipPath>
      </defs>
      <rect
        className="jar-fill"
        x="9"
        y={level}
        width="42"
        height={bottom - level}
        clipPath={`url(#${clip})`}
      />
      <rect className="jar-glass" x="9" y={top} width="42" height={bottom - top} rx="10" />
      <rect className="jar-lid" x="15" y="6" width="30" height="8" rx="3" />
    </svg>
  );
}

function GoalForm({ editing, onDone }: { editing?: Goal; onDone: () => void }) {
  const saveGoal = useLedger((s) => s.saveGoal);
  const today = todayISO();
  const [name, setName] = useState(editing?.name ?? '');
  const [kind, setKind] = useState<GoalKind>(editing?.kind ?? 'goal');
  const [target, setTarget] = useState<number | null>(editing?.targetMinor ?? null);
  const [due, setDue] = useState(editing?.dueDate ?? addDays(today, 180));
  const [yearly, setYearly] = useState(!!editing?.yearly);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give it a name, like “New phone” or “Car insurance”');
    if (target === null || target <= 0) return setError('Enter the amount you need');
    if (!parseISO(due)) return setError('Pick the date you need it by');
    if (due <= today) return setError('Pick a date after today');
    const draft: GoalDraft = {
      name,
      kind,
      targetMinor: target,
      startDate: editing?.startDate ?? today,
      dueDate: due,
      yearly: kind === 'fund' && yearly,
    };
    await saveGoal(draft, editing?.id);
    onDone();
  };

  const prefix = editing ? `goal-${editing.id}` : 'goal-new';
  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${prefix}-name`}>Name</label>
          <input
            id={`${prefix}-name`}
            className="input"
            autoComplete="off"
            maxLength={MAX_GOAL_NAME}
            placeholder="New phone"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-kind`}>Kind</label>
          <select
            id={`${prefix}-kind`}
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as GoalKind)}
          >
            {(Object.keys(GOAL_KIND_LABEL) as GoalKind[]).map((k) => (
              <option key={k} value={k}>
                {GOAL_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-target`}>Amount needed</label>
          <AmountInput id={`${prefix}-target`} initialMinor={target} onChange={setTarget} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-due`}>Needed by</label>
          <input
            id={`${prefix}-due`}
            className="input"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
      </div>
      {kind === 'fund' && (
        <label className="check">
          <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
          Comes every year (starts again once paid)
        </label>
      )}
      <p className="muted small">
        {kind === 'fund'
          ? 'A fund is money put aside for a cost you know is coming, like insurance, school fees or Diwali.'
          : 'A save-up goal is money you keep, like a new phone or an emergency fund.'}{' '}
        Putting money aside is a note to yourself; it does not move money between accounts.
      </p>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary">
          {editing ? 'Save changes' : 'Add goal'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PutAside({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const addToGoal = useLedger((s) => s.addToGoal);
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (amount === null || amount <= 0) return setError('Enter the amount you put aside');
    if (!parseISO(date)) return setError('Pick a date');
    await addToGoal(goal.id, amount, date);
    onDone();
  };
  return (
    <form className="put-aside" onSubmit={(e) => void submit(e)} noValidate>
      <div className="field">
        <label htmlFor={`put-${goal.id}`}>Amount put aside</label>
        <AmountInput id={`put-${goal.id}`} initialMinor={null} onChange={setAmount} />
      </div>
      <div className="field">
        <label htmlFor={`put-date-${goal.id}`}>Date</label>
        <input
          id={`put-date-${goal.id}`}
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary">
          Save
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function GoalCard({ goal, today }: { goal: Goal; today: string }) {
  const currency = useLedger((s) => s.settings.currency);
  const snoozeGoal = useLedger((s) => s.snoozeGoal);
  const payGoal = useLedger((s) => s.payGoal);
  const deleteGoal = useLedger((s) => s.deleteGoal);
  const removeFromGoal = useLedger((s) => s.removeFromGoal);
  const [mode, setMode] = useState<'view' | 'edit' | 'put'>('view');
  if (mode === 'edit') return <GoalForm editing={goal} onDone={() => setMode('view')} />;
  const state = goalState(goal, today);
  const saved = savedMinor(goal);
  const need = monthlyNeed(goal, today);
  const thisMonth = savedThisMonth(goal, today);
  const month = monthKey(today);
  const snoozed = goal.snoozed.includes(month);
  const open = state !== 'paid' && state !== 'done';
  const fill = jarFill(goal);

  return (
    <article className="goal" aria-labelledby={`goal-${goal.id}`} data-testid="goal">
      <Jar id={goal.id} fill={fill} />
      <div className="goal-main">
        <div className="card-head">
          <h3 id={`goal-${goal.id}`}>{goal.name}</h3>
          <span className={`goal-state goal-state-${state}`} data-testid="goal-state">
            {GOAL_STATE_LABEL[state]}
          </span>
        </div>
        <p className="muted small">
          {GOAL_KIND_LABEL[goal.kind]}
          {goal.yearly ? ', every year' : ''}
          {state === 'paid' && goal.paidOn
            ? `, paid ${fmtDate(goal.paidOn)}`
            : `, needed by ${fmtDate(goal.dueDate)}`}
          {goal.lastPaidOn ? `. Last paid ${fmtDate(goal.lastPaidOn)}` : ''}
        </p>
        <p data-testid="goal-saved">
          <Money minor={saved} currency={currency} /> of{' '}
          <Money minor={goal.targetMinor} currency={currency} /> put aside ({Math.round(fill * 100)}
          %)
        </p>
        {open && (
          <p className="small" data-testid="goal-need">
            {snoozed ? (
              'Snoozed this month. The months left share the rest.'
            ) : need > 0 ? (
              <>
                Put aside <Money minor={need} currency={currency} /> this month
                {thisMonth > 0 ? (
                  <>
                    ; <Money minor={thisMonth} currency={currency} /> so far
                  </>
                ) : null}
                .
              </>
            ) : (
              'Nothing more needed this month.'
            )}
          </p>
        )}
        {mode === 'put' && <PutAside goal={goal} onDone={() => setMode('view')} />}
        {mode === 'view' && (
          <div className="btn-row">
            {open && (
              <button type="button" className="btn" onClick={() => setMode('put')}>
                <Icon name="plus" />
                Put aside
              </button>
            )}
            {open && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void snoozeGoal(goal.id, month, !snoozed)}
              >
                {snoozed ? 'Unsnooze' : 'Snooze this month'}
              </button>
            )}
            {goal.kind === 'fund' && state !== 'paid' && (
              <button type="button" className="btn btn-ghost" onClick={() => void payGoal(goal.id)}>
                Paid
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setMode('edit')}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void deleteGoal(goal.id)}
            >
              Delete
            </button>
          </div>
        )}
        {goal.contributions.length > 0 && (
          <details className="goal-history">
            <summary>
              {goal.contributions.length === 1
                ? '1 amount put aside'
                : `${goal.contributions.length} amounts put aside`}
            </summary>
            <ul className="money-list">
              {[...goal.contributions]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((c) => (
                  <li key={c.id} className="money-row">
                    <span className="money-main">{fmtDate(c.date)}</span>
                    <Money minor={c.amountMinor} currency={currency} />
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Remove the amount put aside on ${fmtDate(c.date)}`}
                      onClick={() => void removeFromGoal(goal.id, c.id)}
                    >
                      <Icon name="close" />
                    </button>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}

/** Budgets > Goals: save-up goals and funds for known costs. */
export function GoalsView() {
  const goals = useLedger((s) => s.goals);
  const currency = useLedger((s) => s.settings.currency);
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  const sorted = sortGoals(goals, today);
  const needed = goals.reduce((s, g) => s + monthlyNeed(g, today), 0);
  const putAside = goals.filter((g) => !g.paidOn).reduce((s, g) => s + savedThisMonth(g, today), 0);
  return (
    <section className="card" aria-labelledby="goals-title">
      <div className="card-head">
        <h2 id="goals-title">Goals and funds</h2>
        {!adding && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add goal
          </button>
        )}
      </div>
      {goals.length > 0 && (
        <p className="small" data-testid="goals-month">
          This month: <Money minor={putAside} currency={currency} /> put aside, plan{' '}
          <Money minor={needed} currency={currency} />. Safe to spend on the Dashboard already
          leaves this out.
        </p>
      )}
      {adding && <GoalForm onDone={() => setAdding(false)} />}
      {goals.length === 0 && !adding && (
        <p className="muted small">
          Saving for something, or a yearly cost like insurance, school fees or Diwali? Add it with
          an amount and a date, and Ledger works out what to put aside each month and whether you
          are on track.
        </p>
      )}
      {sorted.map((g) => (
        <GoalCard key={g.id} goal={g} today={today} />
      ))}
    </section>
  );
}
