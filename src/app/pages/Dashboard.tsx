import { useMemo, useState } from 'react';
import { MonthBars, type BarMode } from '../../charts/MonthBars';
import { Donut } from '../../charts/Donut';
import { useLedger } from '../../data/store';
import {
  categoryTotals,
  kpis,
  lastMonths,
  monthSeries,
  previousMonth,
} from '../../domain/aggregates';
import {
  budgetsForMonth,
  budgetStatus,
  daysLeft,
  hasBudgets,
  projectMonthEnd,
  whatIfMonthEnd,
} from '../../domain/budgets';
import { categoryById } from '../../domain/categories';
import { daysInMonth, isoFromYMD, monthLabel, parseISO, todayISO } from '../../domain/dates';
import { fmtMoney } from '../../domain/money';
import { Money, usePrivacy } from '../Money';
import { QuickAdd } from '../QuickAdd';
import { href, navigate } from '../router';
import { TxList } from '../TxList';

const PER_DAY_STEP = 1000; // ₹10

function StatusText({
  spent,
  budget,
  currency,
}: {
  spent: number;
  budget: number;
  currency: string;
}) {
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

function BudgetCard({
  spent,
  dailyAvg,
  today,
}: {
  spent: number;
  dailyAvg: number;
  today: string;
}) {
  const budgets = useLedger((s) => s.budgets);
  const currency = useLedger((s) => s.settings.currency);
  const setMonthBudgets = useLedger((s) => s.setMonthBudgets);
  usePrivacy(); // the slider's aria-valuetext uses fmtMoney
  const month = today.slice(0, 7);
  const mine = budgetsForMonth(budgets, month);
  const last = budgetsForMonth(budgets, previousMonth(month));
  const [dismissed, setDismissed] = useState(false);
  const p = parseISO(today)!;
  const dim = daysInMonth(p.y, p.m);
  const left = daysLeft(today);
  const budget = mine.overall;
  const maxPerDay = Math.max(
    dailyAvg * 2,
    budget !== null ? Math.round((budget / dim) * 2) : 0,
    100_000,
  );
  const startPct = Math.min(100, Math.round((dailyAvg / maxPerDay) * 100));
  const [pct, setPct] = useState<number | null>(null);
  const perDay = Math.round((maxPerDay * (pct ?? startPct)) / 100 / PER_DAY_STEP) * PER_DAY_STEP;
  const projected = projectMonthEnd(spent, today);
  const whatIf = whatIfMonthEnd(spent, today, perDay);
  const endLabel = `${p.d === dim ? 'today' : `by ${dim} ${monthLabel(month).slice(0, 3)}`}`;

  if (budget === null) {
    const ghost = !dismissed && !hasBudgets(mine) && last.overall !== null ? last.overall : null;
    return (
      <section className="card" aria-labelledby="budget-title">
        <h2 id="budget-title">Budget</h2>
        {ghost !== null ? (
          <div className="ghost">
            <p>
              Last month&rsquo;s budget was <Money minor={ghost} currency={currency} />. Use the
              same budgets for {monthLabel(month)}?
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void setMonthBudgets(month, last, "Copied last month's budgets")}
              >
                Accept
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDismissed(true)}>
                Reject
              </button>
            </div>
          </div>
        ) : (
          <p className="muted">
            No budget for {monthLabel(month)}. <a href={href('/budgets')}>Set one</a> to see what is
            left and where the month is heading.
          </p>
        )}
      </section>
    );
  }

  const status = budgetStatus(spent, budget);
  const projectedStatus = budgetStatus(projected, budget);
  const whatIfStatus = budgetStatus(whatIf, budget);

  return (
    <section className="card budget-card" aria-labelledby="budget-title">
      <div className="card-head">
        <h2 id="budget-title">Budget</h2>
        <a className="small" href={href('/budgets')}>
          Edit
        </a>
      </div>
      <p className="big-figure" data-testid="budget-left">
        <StatusText spent={spent} budget={budget} currency={currency} />
      </p>
      <div className="meter" aria-hidden="true">
        <span
          className={`meter-fill meter-${status.kind}`}
          style={{ width: `${Math.min(100, status.ratio * 100)}%` }}
        />
      </div>
      <p className="muted small">
        <Money minor={spent} currency={currency} /> of <Money minor={budget} currency={currency} />{' '}
        spent.{' '}
        {p.d < dim ? (
          <>
            At this pace, <Money minor={projected} currency={currency} /> {endLabel}
            {projectedStatus.kind === 'over' ? (
              <>
                , over by <Money minor={projectedStatus.overMinor} currency={currency} />.
              </>
            ) : (
              <>, within budget.</>
            )}
          </>
        ) : null}
      </p>
      {left > 0 && (
        <div className="what-if">
          <label htmlFor="what-if">
            What if I spend <Money minor={perDay} currency={currency} /> a day from tomorrow?
          </label>
          <input
            id="what-if"
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct ?? startPct}
            aria-valuetext={`${fmtMoney(perDay, { currency })} a day`}
            onChange={(e) => setPct(Number(e.target.value))}
          />
          <p className="small" role="status" data-testid="what-if-result">
            {monthLabel(month)} ends at <Money minor={whatIf} currency={currency} />
            {whatIfStatus.kind === 'over' ? (
              <>
                , over by <Money minor={whatIfStatus.overMinor} currency={currency} />.
              </>
            ) : (
              <>
                , <Money minor={whatIfStatus.leftMinor} currency={currency} /> under budget.
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

export function Dashboard() {
  const transactions = useLedger((s) => s.transactions);
  const categories = useLedger((s) => s.categories);
  const budgets = useLedger((s) => s.budgets);
  const currency = useLedger((s) => s.settings.currency);
  const removeTransaction = useLedger((s) => s.removeTransaction);
  const setMonthBudgets = useLedger((s) => s.setMonthBudgets);
  const [mode, setMode] = useState<BarMode>('total');

  const today = todayISO();
  const month = today.slice(0, 7);
  const k = useMemo(() => kpis(transactions, today), [transactions, today]);
  const toDate = useMemo(() => transactions.filter((t) => t.date <= today), [transactions, today]);
  const totals = useMemo(() => categoryTotals(toDate, month), [toDate, month]);
  const series = useMemo(() => monthSeries(toDate, lastMonths(today, 6)), [toDate, today]);
  const mine = budgetsForMonth(budgets, month);
  const recent = transactions.slice(0, 6);
  const top = k.topCategory ? categoryById(categories, k.topCategory.categoryId) : undefined;
  const first = isoFromYMD(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1);

  return (
    <>
      <QuickAdd />
      <section className="kpis" aria-label={`${monthLabel(month)} so far`}>
        <div className="card kpi">
          <h2>Spent this month</h2>
          <p className="kpi-value" data-testid="month-total">
            <Money minor={k.spentMinor} currency={currency} />
          </p>
          <p className="muted small">{k.entries === 1 ? '1 entry' : `${k.entries} entries`}</p>
        </div>
        <div className="card kpi">
          <h2>Against last month</h2>
          <p className="kpi-value" data-testid="kpi-change">
            {k.changePct === null
              ? 'No comparison'
              : k.changePct === 0
                ? 'The same'
                : `${Math.abs(k.changePct)}% ${k.changePct > 0 ? 'more' : 'less'}`}
          </p>
          <p className="muted small">
            Than by day {k.daysElapsed} of last month,{' '}
            <Money minor={k.lastMonthToDateMinor} currency={currency} />
          </p>
        </div>
        <div className="card kpi">
          <h2>Daily average</h2>
          <p className="kpi-value">
            <Money minor={k.dailyAvgMinor} currency={currency} />
          </p>
          <p className="muted small">
            Over {k.daysElapsed === 1 ? '1 day' : `${k.daysElapsed} days`}
          </p>
        </div>
        <div className="card kpi">
          <h2>Top category</h2>
          <p className="kpi-value kpi-name">{top ? top.name : 'None yet'}</p>
          <p className="muted small">
            {k.topCategory ? (
              <Money minor={k.topCategory.totalMinor} currency={currency} />
            ) : (
              'Add an entry to see it'
            )}
          </p>
        </div>
      </section>
      <BudgetCard key={month} spent={k.spentMinor} dailyAvg={k.dailyAvgMinor} today={today} />
      <div className="chart-row">
        <section className="card chart-card" aria-labelledby="donut-title">
          <div className="card-head">
            <h2 id="donut-title">Where it went</h2>
            <span className="muted small">{monthLabel(month)}</span>
          </div>
          <Donut
            totals={totals}
            categories={categories}
            currency={currency}
            caption="This month"
            onSelect={(id) => navigate(`/transactions?category=${id}&from=${first}&to=${today}`)}
          />
        </section>
        <section className="card chart-card" aria-labelledby="bars-title">
          <div className="card-head">
            <h2 id="bars-title">Last six months</h2>
            <div className="segmented" role="group" aria-label="Show">
              <button
                type="button"
                aria-pressed={mode === 'total'}
                onClick={() => setMode('total')}
              >
                Total
              </button>
              <button
                type="button"
                aria-pressed={mode === 'category'}
                onClick={() => setMode('category')}
              >
                By category
              </button>
            </div>
          </div>
          <MonthBars
            series={series}
            categories={categories}
            currency={currency}
            mode={mode}
            budgetMinor={mine.overall}
            onBudgetChange={(v) =>
              setMonthBudgets(month, { ...mine, overall: v }, 'Changed the monthly budget')
            }
          />
          {mine.overall === null && (
            <p className="muted small">
              <a href={href('/budgets')}>Set a monthly budget</a> to draw it here and drag it.
            </p>
          )}
        </section>
      </div>
      {transactions.length === 0 ? (
        <section className="card empty">
          <h2>Nothing logged yet</h2>
          <p className="muted">Type your first expense above, something like “chai 20 cash”.</p>
        </section>
      ) : (
        <section className="card" aria-labelledby="recent-title">
          <div className="card-head">
            <h2 id="recent-title">Recent</h2>
            <a href={href('/transactions')} className="small">
              See all
            </a>
          </div>
          <TxList
            label="Recent transactions"
            transactions={recent}
            onDelete={(id) => void removeTransaction(id)}
          />
        </section>
      )}
    </>
  );
}
