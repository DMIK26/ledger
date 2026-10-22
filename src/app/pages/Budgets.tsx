import { MoodFace, MOOD_OF } from '../../doodle/faces';
import { useMemo, useState, type FormEvent } from 'react';
import { AllocationBar } from '../../charts/AllocationBar';
import { PaceChart } from '../../charts/PaceChart';
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
import { monthBounds, monthKey, monthLabel, todayISO } from '../../domain/dates';
import { fmtMoney } from '../../domain/money';
import { pinnedCategories } from '../../domain/pins';
import {
  BUDGET_KIND_HINT,
  BUDGET_KIND_LABEL,
  BUDGET_KINDS,
  budgetKindOf,
  effectiveBudget,
  pacingSeries,
  spendIndex,
  type EffectiveBudget,
} from '../../domain/plan';
import { usePins, useScopedTransactions, useViewMonth } from '../../kit/view';
import type { BudgetKind, Category } from '../../domain/types';
import { AmountInput } from '../AmountInput';
import { Money, usePrivacy } from '../Money';
import { navigate } from '../router';
import { RiskText, useRisks } from '../plan/AtRisk';
import { GoalsView } from '../plan/Goals';
import { WishlistView } from '../plan/Wishlist';

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

/** The month's pace: spending added up day by day against a straight line to the plan. */
function PaceCard({
  month,
  planMinor,
  today,
}: {
  month: string;
  planMinor: number;
  today: string;
}) {
  const transactions = useScopedTransactions();
  const currency = useLedger((s) => s.settings.currency);
  usePrivacy(); // the chart's label uses fmtMoney
  const points = useMemo(
    () => pacingSeries(transactions, month, planMinor, today),
    [transactions, month, planMinor, today],
  );
  const shown = points.filter((p) => p.actualMinor !== null);
  const last = shown[shown.length - 1];
  if (!last) return null;
  const actual = last.actualMinor!;
  const gap = actual - last.idealMinor;
  const money = (m: number) => fmtMoney(m, { currency });
  const label = `${money(actual)} spent by day ${last.day}; the straight line to ${money(planMinor)} is at ${money(last.idealMinor)}.`;
  return (
    <section className="card" aria-labelledby="pace-title">
      <div className="card-head">
        <h2 id="pace-title">Pace</h2>
        <span className="muted small">
          Day {last.day} of {points.length}
        </span>
      </div>
      <PaceChart points={points} label={label} />
      <p className="small" data-testid="pace-text">
        <Money minor={actual} currency={currency} /> spent by day {last.day}.{' '}
        {gap > 0 ? (
          <span className="status-over">
            <Money minor={gap} currency={currency} /> above the straight line to{' '}
            <Money minor={planMinor} currency={currency} />.
          </span>
        ) : (
          <>
            <Money minor={-gap} currency={currency} /> below the straight line to{' '}
            <Money minor={planMinor} currency={currency} />.
          </>
        )}
      </p>
      <p className="muted small pace-key">
        <span
          className={gap > 0 ? 'pace-swatch pace-swatch-over' : 'pace-swatch'}
          aria-hidden="true"
        />{' '}
        Spent so far
        <span className="pace-swatch pace-swatch-ideal" aria-hidden="true" /> Even pace
      </p>
    </section>
  );
}

const VIEWS = [
  { id: 'budgets', label: 'Budgets' },
  { id: 'goals', label: 'Goals' },
  { id: 'wishlist', label: 'Wishlist' },
] as const;
type View = (typeof VIEWS)[number]['id'];

/** Budgets, goals and funds, and the wishlist (Drop 10): planning ahead in one place. */
export function Budgets({ view }: { view?: string | null }) {
  const current: View = view === 'goals' || view === 'wishlist' ? view : 'budgets';
  return (
    <>
      <div className="segmented page-views" role="group" aria-label="Show">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={current === v.id}
            onClick={() => navigate(v.id === 'budgets' ? '/budgets' : `/budgets?view=${v.id}`)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {current === 'budgets' && <BudgetPlan />}
      {current === 'goals' && <GoalsView />}
      {current === 'wishlist' && <WishlistView />}
    </>
  );
}

function CarryText({ effective, currency }: { effective: EffectiveBudget; currency: string }) {
  if (effective.carryMinor === 0) return null;
  return (
    <span className="muted small budget-carry" data-testid="budget-carry">
      {effective.carryMinor > 0 ? 'plus ' : 'less '}
      <Money minor={Math.abs(effective.carryMinor)} currency={currency} /> carried
    </span>
  );
}

function BudgetPlan() {
  const transactions = useScopedTransactions();
  const everything = useLedger((s) => s.transactions);
  const allCategories = useLedger((s) => s.categories);
  const pinnedCats = pinnedCategories(usePins());
  // With categories pinned, only those rows show; the monthly budget and split stay whole.
  const categories = pinnedCats
    ? allCategories.filter((c) => pinnedCats.includes(c.id))
    : allCategories;
  const budgets = useLedger((s) => s.budgets);
  const currency = useLedger((s) => s.settings.currency);
  const setMonthBudgets = useLedger((s) => s.setMonthBudgets);
  const clearMonthBudgets = useLedger((s) => s.clearMonthBudgets);
  const setCategoryPlan = useLedger((s) => s.setCategoryPlan);
  const [proposal, setProposal] = useState<{
    kind: 'suggest' | 'copy';
    budgets: MonthBudgets;
  } | null>(null);

  const now = todayISO();
  const month = useViewMonth();
  const monthEnd = monthBounds(month).end;
  // Spent so far for the current month; the whole month for a past one.
  const today = monthEnd < now ? monthEnd : now;
  const isCurrent = month === monthKey(now);
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
  const spentIn = useMemo(() => spendIndex(everything), [everything]);
  const effective = useMemo(
    () =>
      Object.fromEntries(
        allCategories.map((c) => [c.id, effectiveBudget(budgets, spentIn, month, c)]),
      ) as Record<string, EffectiveBudget | null>,
    [allCategories, budgets, spentIn, month],
  );
  const risks = useRisks(now);
  const riskOf = (id: string) => (isCurrent ? risks.find((r) => r.categoryId === id) : undefined);
  const catTotal = categories.reduce((s, c) => s + (effective[c.id]?.totalMinor ?? 0), 0);
  const planMinor = mine.overall ?? (catTotal > 0 ? catTotal : null);

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
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!hasBudgets(mine)}
          onClick={() => {
            void clearMonthBudgets(month);
            setProposal({ kind: 'suggest', budgets: suggestBudgets(transactions, today) });
          }}
        >
          Reset plan
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

      {planMinor !== null && planMinor > 0 && (
        <PaceCard month={month} planMinor={planMinor} today={today} />
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
        <p className="muted small">
          Fixed costs stay about the same each month, flexible spending changes day to day, and
          non-monthly costs come now and then. The forecast only stretches flexible spending over
          the month.
        </p>
        {BUDGET_KINDS.map((kind) => {
          const group = categories.filter((c) => budgetKindOf(c.id, allCategories) === kind);
          if (group.length === 0) return null;
          const groupBudget = group.reduce((s, c) => s + (effective[c.id]?.totalMinor ?? 0), 0);
          const groupSpent = group.reduce((s, c) => s + (spentBy[c.id] ?? 0), 0);
          return (
            <div key={kind} className="budget-group" data-testid={`budget-group-${kind}`}>
              <div className="budget-group-head">
                <h3>{BUDGET_KIND_LABEL[kind]}</h3>
                <span className="muted small" data-testid={`budget-subtotal-${kind}`}>
                  <Money minor={groupSpent} currency={currency} /> of{' '}
                  <Money minor={groupBudget} currency={currency} />
                </span>
              </div>
              <p className="muted small budget-group-hint">{BUDGET_KIND_HINT[kind]}</p>
              <ul className="budget-list">
                {group.map((c) => (
                  <BudgetRow
                    key={c.id}
                    category={c}
                    kind={kind}
                    budget={mine.categories[c.id] ?? null}
                    effective={effective[c.id] ?? null}
                    used={spentBy[c.id] ?? 0}
                    risk={riskOf(c.id)}
                    proposal={proposal}
                    currency={currency}
                    onSave={(v) =>
                      save(
                        { ...mine, categories: { ...mine.categories, [c.id]: v } },
                        `Changed the ${c.name} budget`,
                      )
                    }
                    onKind={(k) => void setCategoryPlan(c.id, { budgetKind: k })}
                    onRollover={(on) => void setCategoryPlan(c.id, { rollover: on })}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </>
  );
}

function BudgetRow({
  category: c,
  kind,
  budget,
  effective,
  used,
  risk,
  proposal,
  currency,
  onSave,
  onKind,
  onRollover,
}: {
  category: Category;
  kind: BudgetKind;
  budget: number | null;
  effective: EffectiveBudget | null;
  used: number;
  risk: ReturnType<typeof useRisks>[number] | undefined;
  proposal: { kind: 'suggest' | 'copy'; budgets: MonthBudgets } | null;
  currency: string;
  onSave: (minor: number) => void;
  onKind: (kind: BudgetKind) => void;
  onRollover: (on: boolean) => void;
}) {
  const proposed = proposal?.budgets.categories[c.id];
  // With rollover, status and meter use the budget plus what carried in.
  const total = effective ? effective.totalMinor : budget;
  return (
    <li className="budget-row" data-testid={`budget-row-${c.id}`}>
      <span className="budget-name">
        <span className="dot" style={{ background: c.color }} />
        {c.name}
      </span>
      <span className="budget-spent">
        <Money minor={used} currency={currency} /> spent
      </span>
      <span className="budget-status">
        <Status spent={used} budget={total} currency={currency} />
      </span>
      <BudgetField
        id={`budget-${c.id}`}
        label={`Budget for ${c.name}`}
        value={budget}
        onSave={onSave}
      />
      <Meter spent={used} budget={total} anchor={`budget:${c.id}`} />
      <div className="budget-extra">
        <select
          className="input input-small"
          aria-label={`Type of ${c.name}`}
          value={kind}
          onChange={(e) => onKind(e.target.value as BudgetKind)}
        >
          {BUDGET_KINDS.map((k) => (
            <option key={k} value={k}>
              {BUDGET_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <label className="check small">
          <input
            type="checkbox"
            checked={!!c.rollover}
            onChange={(e) => onRollover(e.target.checked)}
          />
          Roll over
        </label>
        {effective && <CarryText effective={effective} currency={currency} />}
        {risk?.kind === 'at-risk' && (
          <span className="small risk-chip" data-testid={`risk-${c.id}`}>
            <RiskText risk={risk} currency={currency} />
          </span>
        )}
      </div>
      {proposal && proposed !== undefined && (
        <span className="ghost-chip">
          {proposal.kind === 'suggest' ? 'Suggested' : 'Last month'}{' '}
          <Money minor={proposed} currency={currency} />
        </span>
      )}
    </li>
  );
}
