import { MoodFace, MOOD_OF } from '../../doodle/faces';
import { useState, type FormEvent } from 'react';
import { AllocationBar } from '../../charts/AllocationBar';
import { fillFor } from '../../charts/fills';
import { useLedger } from '../../data/store';
import { categoryTotals, previousMonth } from '../../domain/aggregates';
import {
  budgetsForMonth,
  budgetStatus,
  copyFromPreviousMonth,
  hasBudgets,
  suggestBudgets,
  type MonthBudgets,
  type Segment,
} from '../../domain/budgets';
import { daysInMonth, isoFromYMD, monthLabel, todayISO } from '../../domain/dates';
import { pinnedCategories } from '../../domain/pins';
import { usePins, useScopedTransactions, useViewMonth } from '../../kit/view';
import type { Category } from '../../domain/types';
import { AmountInput } from '../AmountInput';
import { Money } from '../Money';

function Status({
  spent,
  budget,
  currency,
}: {
  spent: number;
  budget: number | null;
  currency: string;
}) {
  if (budget === null) return <span className="muted">No budget</span>;
  const s = budgetStatus(spent, budget);
  if (s.kind === 'over')
    return (
      <span className="status-over">
        Over by <Money minor={s.overMinor} currency={currency} />
      </span>
    );
  return (
    <span className={s.kind === 'near' ? 'status-near' : undefined}>
      <Money minor={s.leftMinor} currency={currency} /> left
    </span>
  );
}

function Meter({
  spent,
  budget,
  anchor,
}: {
  spent: number;
  budget: number | null;
  anchor: string;
}) {
  if (budget === null) return <div className="meter meter-empty" aria-hidden="true" />;
  const s = budgetStatus(spent, budget);
  return (
    <div className="meter-wrap" data-anchor={anchor}>
      <div className="meter" aria-hidden="true">
        <span
          className={`meter-fill meter-${s.kind}`}
          style={{ width: `${Math.min(100, s.ratio * 100)}%` }}
        />
      </div>
      <MoodFace mood={MOOD_OF[s.kind]} />
    </div>
  );
}

/** An amount field that saves when you press Enter or leave it. Empty means no budget. */
function BudgetField({
  id,
  label,
  value,
  onSave,
}: {
  id: string;
  label: string;
  value: number | null;
  onSave: (minor: number) => void;
}) {
  const [draft, setDraft] = useState<number | null | undefined>(undefined);
  const commit = () => {
    if (draft === undefined) return;
    const next = draft ?? 0;
    setDraft(undefined);
    if (next !== (value ?? 0)) onSave(next);
  };
  return (
    <form
      className="budget-field"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        commit();
      }}
    >
      <AmountInput
        key={value ?? 'none'}
        id={id}
        ariaLabel={label}
        initialMinor={value}
        onChange={(v) => setDraft(v)}
        onBlur={commit}
      />
    </form>
  );
}

function GhostBar({
  proposal,
  categories,
}: {
  proposal: MonthBudgets;
  categories: readonly Category[];
}) {
  const entries = categories
    .map((c) => ({ c, v: proposal.categories[c.id] ?? 0 }))
    .filter((e) => e.v > 0);
  const total = entries.reduce((s, e) => s + e.v, 0);
  if (total === 0) return null;
  return (
    <div className="alloc-bar alloc-ghost" aria-hidden="true">
      {entries.map(({ c, v }) => (
        <span
          key={c.id}
          className="alloc-seg"
          style={{ width: `${(v / total) * 100}%`, background: fillFor(c) }}
        />
      ))}
    </div>
  );
}

export function Budgets() {
  const transactions = useScopedTransactions();
  const allCategories = useLedger((s) => s.categories);
  const pinnedCats = pinnedCategories(usePins());
  // With categories pinned, only those rows show; the monthly budget and split stay whole.
  const categories = pinnedCats
    ? allCategories.filter((c) => pinnedCats.includes(c.id))
    : allCategories;
  const budgets = useLedger((s) => s.budgets);
  const currency = useLedger((s) => s.settings.currency);
  const setMonthBudgets = useLedger((s) => s.setMonthBudgets);
  const [proposal, setProposal] = useState<{
    kind: 'suggest' | 'copy';
    budgets: MonthBudgets;
  } | null>(null);

  const now = todayISO();
  const month = useViewMonth();
  const [vy, vm] = month.split('-').map(Number);
  const monthEnd = isoFromYMD(vy!, vm!, daysInMonth(vy!, vm!));
  // Spent so far for the current month; the whole month for a past one.
  const today = monthEnd < now ? monthEnd : now;
  const mine = budgetsForMonth(budgets, month);
  const last = budgetsForMonth(budgets, previousMonth(month));
  const spentBy: Record<string, number> = Object.fromEntries(
    categoryTotals(
      transactions.filter((x) => x.date <= today),
      month,
    ).map((t) => [t.categoryId, t.totalMinor]),
  );
  const spent = Object.values(spentBy).reduce((a, b) => a + b, 0);
  const catSum = Object.values(mine.categories).reduce((a, b) => a + b, 0);
  const segments: Segment[] = categories
    .filter((c) => (mine.categories[c.id] ?? 0) > 0)
    .map((c) => ({ id: c.id, amountMinor: mine.categories[c.id]! }));
  const unallocated = mine.overall !== null ? Math.max(0, mine.overall - catSum) : 0;

  const save = (next: MonthBudgets, label: string) => void setMonthBudgets(month, next, label);

  return (
    <>
      <section className="card" aria-labelledby="overall-title">
        <div className="card-head">
          <h2 id="overall-title">
            <label htmlFor="budget-overall">Monthly budget</label>
          </h2>
          <span className="muted small">{monthLabel(month)}</span>
        </div>
        <div className="budget-overall">
          <BudgetField
            id="budget-overall"
            label="Monthly budget"
            value={mine.overall}
            onSave={(v) => save({ ...mine, overall: v || null }, 'Changed the monthly budget')}
          />
          <p data-testid="overall-status">
            <Status spent={spent} budget={mine.overall} currency={currency} />
          </p>
        </div>
        <Meter spent={spent} budget={mine.overall} anchor="budget:overall" />
        <p className="muted small">
          <Money minor={spent} currency={currency} /> spent so far this month.
        </p>
        {mine.overall !== null && catSum > mine.overall && (
          <p className="warning">
            Category budgets add up to <Money minor={catSum} currency={currency} />, more than the
            monthly budget.
          </p>
        )}
      </section>

      <div className="toolbar">
        <button
          type="button"
          className="btn"
          onClick={() =>
            setProposal({ kind: 'suggest', budgets: suggestBudgets(transactions, today) })
          }
        >
          Suggest budgets
        </button>
        <button
          type="button"
          className="btn"
          disabled={!hasBudgets(last)}
          onClick={() =>
            setProposal({ kind: 'copy', budgets: copyFromPreviousMonth(budgets, month) })
          }
        >
          Copy last month
        </button>
      </div>

      {proposal && (
        <section className="card ghost" aria-labelledby="proposal-title" data-testid="proposal">
          <h2 id="proposal-title">
            {proposal.kind === 'suggest'
              ? 'Suggested from your last three months'
              : `Budgets from ${monthLabel(previousMonth(month))}`}
          </h2>
          {hasBudgets(proposal.budgets) ? (
            <>
              <p className="muted small">
                Monthly budget{' '}
                {proposal.budgets.overall !== null ? (
                  <Money minor={proposal.budgets.overall} currency={currency} />
                ) : (
                  'none'
                )}
                . The dashed rows below show each category. Accept replaces this month&rsquo;s
                budgets; you can undo it.
              </p>
              <GhostBar proposal={proposal.budgets} categories={categories} />
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    save(
                      proposal.budgets,
                      proposal.kind === 'suggest'
                        ? 'Accepted suggested budgets'
                        : "Copied last month's budgets",
                    );
                    setProposal(null);
                  }}
                >
                  Accept
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setProposal(null)}>
                  Reject
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small">
                {proposal.kind === 'suggest'
                  ? 'There is not enough spending in the last three months to suggest anything yet.'
                  : 'Last month had no budgets.'}
              </p>
              <button type="button" className="btn btn-ghost" onClick={() => setProposal(null)}>
                Close
              </button>
            </>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="split-title">
        <h2 id="split-title">Split by category</h2>
        {segments.length === 0 ? (
          <p className="muted small">
            Give categories a budget below to see how the month is split.
          </p>
        ) : (
          <>
            <p className="muted small">
              Drag a divider, or focus it and use the arrow keys, to move budget between neighbours
              in steps of 500. The total stays the same.
            </p>
            <AllocationBar
              segments={segments}
              unallocatedMinor={unallocated}
              categories={categories}
              currency={currency}
              onCommit={(next) =>
                save(
                  {
                    ...mine,
                    categories: {
                      ...mine.categories,
                      ...Object.fromEntries(next.map((s) => [s.id, s.amountMinor])),
                    },
                  },
                  'Moved budget between categories',
                )
              }
            />
          </>
        )}
      </section>

      <section className="card" aria-labelledby="cats-title">
        <h2 id="cats-title">Categories</h2>
        <ul className="budget-list">
          {categories.map((c) => {
            const budget = mine.categories[c.id] ?? null;
            const proposed = proposal?.budgets.categories[c.id];
            const used = spentBy[c.id] ?? 0;
            return (
              <li key={c.id} className="budget-row" data-testid={`budget-row-${c.id}`}>
                <span className="budget-name">
                  <span className="dot" style={{ background: c.color }} />
                  {c.name}
                </span>
                <span className="budget-spent">
                  <Money minor={used} currency={currency} /> spent
                </span>
                <span className="budget-status">
                  <Status spent={used} budget={budget} currency={currency} />
                </span>
                <BudgetField
                  id={`budget-${c.id}`}
                  label={`Budget for ${c.name}`}
                  value={budget}
                  onSave={(v) =>
                    save(
                      { ...mine, categories: { ...mine.categories, [c.id]: v } },
                      `Changed the ${c.name} budget`,
                    )
                  }
                />
                <Meter spent={used} budget={budget} anchor={`budget:${c.id}`} />
                {proposal && proposed !== undefined && (
                  <span className="ghost-chip">
                    {proposal.kind === 'suggest' ? 'Suggested' : 'Last month'}{' '}
                    <Money minor={proposed} currency={currency} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
