import { EmptyDoodle } from '../../doodle/Studio';
import { MoodFace, MOOD_OF } from '../../doodle/faces';
import { useMemo, useState } from 'react';
import { MonthBars, type BarMode } from '../../charts/MonthBars';
import { Donut } from '../../charts/Donut';
import { useLedger } from '../../data/store';
import {
  categoryTotals,
  inMonth,
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
import { href } from '../router';
import { Breakdown, type BreakdownPath } from '../Breakdown';
import { pinnedCategories } from '../../domain/pins';
import { entityKey } from '../../kit/entityKeys';
import { withTransition } from '../../kit/transition';
import { usePins, useScopedTransactions, useView, useViewMonth } from '../../kit/view';
import { TxList } from '../TxList';
import { Insights } from '../Insights';
import { BackupReminder } from '../BackupReminder';
import { InstallBanner } from '../InstallBanner';
import { LoadSampleButton, SampleBanner } from '../SampleData';

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
  pinned,
}: {
  spent: number;
  dailyAvg: number;
  today: string;
  /** With pins: the budget for what is pinned (sum of pinned categories), or a reason there is none. */
  pinned?: { budget: number | null; note: string } | null;
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
  const budget = pinned ? pinned.budget : mine.overall;
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

  if (budget === null && pinned) {
    return (
      <section className="card" aria-labelledby="budget-title">
        <h2 id="budget-title">Budget</h2>
        <p className="muted">{pinned.note}</p>
      </section>
    );
  }

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
      <div className="meter-wrap" data-anchor={pinned ? undefined : 'budget:overall'}>
        <div className="meter" aria-hidden="true">
          <span
            className={`meter-fill meter-${status.kind}`}
            style={{ width: `${Math.min(100, status.ratio * 100)}%` }}
          />
        </div>
        <MoodFace mood={MOOD_OF[status.kind]} />
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

type KpiView = 'spent' | 'change' | 'daily' | 'top' | null;

function KpiButton({
  id,
  open,
  onToggle,
  children,
}: {
  id: Exclude<KpiView, null>;
  open: boolean;
  onToggle: (id: Exclude<KpiView, null>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="card kpi kpi-button"
      aria-expanded={open}
      aria-controls="kpi-breakdown"
      data-open={open ? '' : undefined}
      style={open ? { viewTransitionName: 'kpi-open' } : undefined}
      onClick={() => onToggle(id)}
    >
      {children}
    </button>
  );
}

export function Dashboard() {
  const all = useLedger((s) => s.transactions);
  const transactions = useScopedTransactions();
  const categories = useLedger((s) => s.categories);
  const budgets = useLedger((s) => s.budgets);
  const currency = useLedger((s) => s.settings.currency);
  const removeTransaction = useLedger((s) => s.removeTransaction);
  const setMonthBudgets = useLedger((s) => s.setMonthBudgets);
  const pins = usePins();
  const setMonth = useView((s) => s.setMonth);
  const [mode, setMode] = useState<BarMode>('total');
  const [preview, setPreview] = useState<string | null>(null);
  const [kpiView, setKpiView] = useState<KpiView>(null);
  const [kpiPath, setKpiPath] = useState<BreakdownPath>([]);
  const [donutPath, setDonutPath] = useState<BreakdownPath>([]);

  const today = todayISO();
  const month = useViewMonth();
  const current = month === today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const first = isoFromYMD(y!, m!, 1);
  const monthEnd = isoFromYMD(y!, m!, daysInMonth(y!, m!));
  // A past month is shown as it ended; the current one up to today.
  const asOf = current ? today : monthEnd < today ? monthEnd : today;
  const k = useMemo(() => kpis(transactions, asOf), [transactions, asOf]);
  const toDate = useMemo(() => transactions.filter((t) => t.date <= asOf), [transactions, asOf]);
  const monthEntries = useMemo(() => inMonth(toDate, month), [toDate, month]);
  const lastMonthEntries = useMemo(() => {
    const prev = previousMonth(month);
    const [py, pm] = prev.split('-').map(Number);
    const cutoff = isoFromYMD(py!, pm!, Math.min(parseISO(asOf)!.d, daysInMonth(py!, pm!)));
    return inMonth(transactions, prev).filter((t) => t.date <= cutoff);
  }, [transactions, month, asOf]);
  const donutMonth = preview ?? month;
  const totals = useMemo(() => categoryTotals(toDate, donutMonth), [toDate, donutMonth]);
  const series = useMemo(() => monthSeries(toDate, lastMonths(asOf, 6)), [toDate, asOf]);
  const mine = budgetsForMonth(budgets, month);
  const recent = transactions.slice(0, 6);
  const top = k.topCategory ? categoryById(categories, k.topCategory.categoryId) : undefined;

  // Budgets belong to whole categories, so with pins the budget card follows the pinned categories.
  const pinnedCats = pinnedCategories(pins);
  const otherPins = pins.some((p) => p.kind !== 'category');
  const pinnedBudget =
    pins.length === 0
      ? null
      : otherPins
        ? {
            budget: null,
            note: 'Budgets cover whole categories. Unpin merchants, days, methods and tags to see one.',
          }
        : pinnedCats!.every((id) => mine.categories[id] !== undefined)
          ? { budget: pinnedCats!.reduce((s, id) => s + mine.categories[id]!, 0), note: '' }
          : { budget: null, note: 'No budget set for the pinned categories this month.' };

  const toggleKpi = (id: Exclude<KpiView, null>) =>
    withTransition(() => {
      setKpiView((v) => (v === id ? null : id));
      setKpiPath(id === 'top' && k.topCategory ? [`c:${k.topCategory.categoryId}`] : []);
    });

  if (all.length === 0) {
    return (
      <>
        <InstallBanner />
        <QuickAdd followMonth />
        <section className="card empty">
          <EmptyDoodle art="notebook" />
          <h2>Nothing logged yet</h2>
          <p className="muted">Type your first expense above, something like “chai 20 cash”.</p>
          <p className="muted small">
            Or look around first with made-up entries you can remove later.
          </p>
          <div className="btn-row empty-actions">
            <LoadSampleButton />
          </div>
        </section>
      </>
    );
  }

  const label = monthLabel(month);
  return (
    <>
      <InstallBanner />
      <SampleBanner />
      <BackupReminder />
      <QuickAdd followMonth />
      <section className="kpis" aria-label={`${label}${current ? ' so far' : ''}`}>
        <KpiButton id="spent" open={kpiView === 'spent'} onToggle={toggleKpi}>
          <h2>{current ? 'Spent this month' : `Spent in ${label.split(' ')[0]}`}</h2>
          <p className="kpi-value" data-testid="month-total">
            <Money minor={k.spentMinor} currency={currency} />
          </p>
          <p className="muted small">{k.entries === 1 ? '1 entry' : `${k.entries} entries`}</p>
        </KpiButton>
        <KpiButton id="change" open={kpiView === 'change'} onToggle={toggleKpi}>
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
        </KpiButton>
        <KpiButton id="daily" open={kpiView === 'daily'} onToggle={toggleKpi}>
          <h2>Daily average</h2>
          <p className="kpi-value">
            <Money minor={k.dailyAvgMinor} currency={currency} />
          </p>
          <p className="muted small">
            Over {k.daysElapsed === 1 ? '1 day' : `${k.daysElapsed} days`}
          </p>
        </KpiButton>
        <KpiButton id="top" open={kpiView === 'top'} onToggle={toggleKpi}>
          <h2>Top category</h2>
          <p
            className="kpi-value kpi-name"
            data-hl={k.topCategory ? entityKey('category', k.topCategory.categoryId) : undefined}
          >
            {top ? top.name : 'None yet'}
          </p>
          <p className="muted small">
            {k.topCategory ? (
              <Money minor={k.topCategory.totalMinor} currency={currency} />
            ) : (
              'Add an entry to see it'
            )}
          </p>
        </KpiButton>
      </section>
      {kpiView && (
        <section
          className="card"
          id="kpi-breakdown"
          aria-label="Breakdown"
          style={{ viewTransitionName: 'kpi-open' }}
        >
          <div className="card-head">
            <h2>
              {
                {
                  spent: 'Where it went',
                  change: 'Against last month',
                  daily: 'Day by day',
                  top: 'Top category',
                }[kpiView]
              }
            </h2>
            <button type="button" className="btn btn-ghost" onClick={() => toggleKpi(kpiView)}>
              Close
            </button>
          </div>
          <Breakdown
            root={kpiView === 'daily' ? 'days' : kpiView === 'change' ? 'compare' : 'categories'}
            rootLabel={kpiView === 'daily' ? 'All days' : 'All categories'}
            entries={monthEntries}
            compareEntries={lastMonthEntries}
            path={kpiPath}
            onPath={setKpiPath}
            range={{ from: first, to: asOf }}
          />
        </section>
      )}
      <BudgetCard
        key={month}
        spent={k.spentMinor}
        dailyAvg={k.dailyAvgMinor}
        today={asOf}
        pinned={pinnedBudget}
      />
      {current && <Insights overallBudgetMinor={pins.length === 0 ? mine.overall : null} />}
      <div className="chart-row">
        <section className="card chart-card" aria-labelledby="donut-title">
          <div className="card-head">
            <h2 id="donut-title">Where it went</h2>
            <span className="muted small" aria-live="polite">
              {preview && preview !== month ? `Preview: ${monthLabel(preview)}` : label}
            </span>
          </div>
          <Donut
            totals={totals}
            categories={categories}
            currency={currency}
            caption={
              preview && preview !== month ? monthLabel(preview) : current ? 'This month' : label
            }
            selected={donutPath[0]?.slice(2) ?? null}
            legend={donutPath.length === 0}
            onSelect={(id) => withTransition(() => setDonutPath([`c:${id}`]))}
          />
          {donutPath.length > 0 && (
            <Breakdown
              root="categories"
              rootLabel="All categories"
              entries={monthEntries}
              path={donutPath}
              onPath={setDonutPath}
              range={{ from: first, to: asOf }}
            />
          )}
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
            budgetMinor={pins.length === 0 ? mine.overall : null}
            selectedMonth={month}
            onHoverMonth={setPreview}
            onSelectMonth={(mm) => {
              setPreview(null);
              setDonutPath([]);
              setMonth(mm);
            }}
            onBudgetChange={(v) =>
              setMonthBudgets(month, { ...mine, overall: v }, 'Changed the monthly budget')
            }
          />
          {pins.length === 0 && mine.overall === null && (
            <p className="muted small">
              <a href={href('/budgets')}>Set a monthly budget</a> to draw it here and drag it.
            </p>
          )}
        </section>
      </div>
      {transactions.length === 0 ? (
        <section className="card empty">
          <EmptyDoodle art="pin" />
          <h2>No entries match the pins</h2>
          <p className="muted">Remove a pin from the bar at the top to see more.</p>
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
