import { EmptyDoodle } from '../../doodle/Studio';
import { MoodFace, MOOD_OF } from '../../doodle/faces';
import { Fragment, lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
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
  samePointLastMonth,
} from '../../domain/aggregates';
import {
  budgetsForMonth,
  budgetStatus,
  daysLeft,
  hasBudgets,
  whatIfMonthEnd,
} from '../../domain/budgets';
import { forecastMonthEnd } from '../../domain/plan';
import { categoryById } from '../../domain/categories';
import {
  addDays,
  fmtDate,
  monthBounds,
  monthKey,
  monthLabel,
  monthProgress,
  todayISO,
} from '../../domain/dates';
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
import { CheckIn } from '../CheckIn';
import { CardDue } from '../money/CardDue';
import { InstallBanner } from '../InstallBanner';
import { LoadSampleButton, SampleBanner } from '../SampleData';
import { SafeToSpendCard } from '../plan/SafeToSpend';
import { MonthCloseCard } from '../plan/MonthClose';
import { AtRiskCard } from '../plan/AtRisk';
import { RecapCard } from '../dash/RecapCard';
import { ScrubChart, type DayPoint } from '../../charts/ScrubChart';
import {
  DASHBOARD_CARD_LABEL,
  dashboardOrder,
  moveCard,
  type DashboardCard,
} from '../../domain/dashboard';
import { useUi } from '../../kit/ui';

const Sketchbook = lazy(() =>
  import('../dash/Sketchbook').then((m) => ({ default: m.Sketchbook })),
);
const LONG_PRESS_MS = 600;

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
  forecast,
  dailyAvg,
  today,
  pinned,
}: {
  spent: number;
  /** Where the month is heading: flexible spending at its rate plus bills still to come. */
  forecast: number;
  dailyAvg: number;
  today: string;
  /** With pins: the budget for what is pinned (sum of pinned categories), or a reason there is none. */
  pinned?: { budget: number | null; note: string } | null;
}) {
  const budgets = useLedger((s) => s.budgets);
  const currency = useLedger((s) => s.settings.currency);
  const setMonthBudgets = useLedger((s) => s.setMonthBudgets);
  usePrivacy(); // the slider's aria-valuetext uses fmtMoney
  const month = monthKey(today);
  const mine = budgetsForMonth(budgets, month);
  const last = budgetsForMonth(budgets, previousMonth(month));
  const [dismissed, setDismissed] = useState(false);
  const { day, length: dim } = monthProgress(today);
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
  const projected = forecast;
  const whatIf = whatIfMonthEnd(spent, today, perDay);
  const endLabel = day === dim ? 'today' : `by ${fmtDate(monthBounds(month).end).slice(0, -5)}`;

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
        {day < dim ? (
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
  const recurring = useLedger((s) => s.recurring);
  const pins = usePins();
  const setMonth = useView((s) => s.setMonth);
  const [mode, setMode] = useState<BarMode>('total');
  const [preview, setPreview] = useState<string | null>(null);
  const [kpiView, setKpiView] = useState<KpiView>(null);
  const [kpiPath, setKpiPath] = useState<BreakdownPath>([]);
  const [donutPath, setDonutPath] = useState<BreakdownPath>([]);
  // The scrubbed day belongs to the month it was chosen in; another month starts unscrubbed.
  const [scrubbed, setScrubbed] = useState<{ month: string; index: number } | null>(null);
  const customising = useUi((s) => s.customising);
  const setCustomising = useUi((s) => s.setCustomising);
  const savedOrder = useLedger((s) => s.settings.dashboardOrder);
  const hiddenCards = useLedger((s) => s.settings.dashboardHidden);
  const doodles = useLedger((s) => s.settings.doodles);
  const setSetting = useLedger((s) => s.setSetting);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);

  const today = todayISO();
  const month = useViewMonth();
  const current = month === monthKey(today);
  const { start: first, end: monthEnd } = monthBounds(month);
  // A past month is shown as it ended; the current one up to today.
  const asOf = current ? today : monthEnd < today ? monthEnd : today;
  const k = useMemo(() => kpis(transactions, asOf), [transactions, asOf]);
  const toDate = useMemo(() => transactions.filter((t) => t.date <= asOf), [transactions, asOf]);
  const monthEntries = useMemo(() => inMonth(toDate, month), [toDate, month]);
  // Day by day: the month's spending added up, for scrubbing.
  const dayPoints = useMemo<DayPoint[]>(() => {
    const byDay = new Map<string, number>();
    for (const t of monthEntries) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amountMinor);
    const out: DayPoint[] = [];
    let total = 0;
    for (let d = first; d <= asOf; d = addDays(d, 1)) {
      const v = byDay.get(d) ?? 0;
      total += v;
      out.push({ date: d, dayMinor: v, totalMinor: total });
    }
    return out;
  }, [monthEntries, first, asOf]);
  const scrub = scrubbed?.month === month ? scrubbed.index : null;
  const setScrub = (index: number | null) => setScrubbed(index === null ? null : { month, index });
  const scrubDate = scrub !== null ? (dayPoints[scrub]?.date ?? null) : null;
  const lastMonthEntries = useMemo(() => {
    const prev = previousMonth(month);
    const cutoff = samePointLastMonth(asOf);
    return inMonth(transactions, prev).filter((t) => t.date <= cutoff);
  }, [transactions, month, asOf]);
  const donutMonth = preview ?? month;
  // Scrubbing the day-by-day chart shows the month up to that day in the donut.
  const totals = useMemo(
    () =>
      categoryTotals(
        scrubDate && !preview ? toDate.filter((t) => t.date <= scrubDate) : toDate,
        donutMonth,
      ),
    [toDate, donutMonth, scrubDate, preview],
  );
  const series = useMemo(() => monthSeries(toDate, lastMonths(asOf, 6)), [toDate, asOf]);
  // Hovering a bar previews that month in the donut. The legend keeps one fixed set of rows (this
  // month's categories, then any other category in the six bars), so the card never changes height
  // under the pointer; a changing height moved the bars under a still mouse and looped the preview.
  const legendIds = useMemo(() => {
    const ids = categoryTotals(toDate, month).map((t) => t.categoryId);
    const seen = new Set(ids);
    for (const c of categories)
      if (!seen.has(c.id) && series.some((p) => (p.byCategory[c.id] ?? 0) > 0)) ids.push(c.id);
    return ids;
  }, [toDate, month, series, categories]);
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

  const forecast = useMemo(
    () =>
      forecastMonthEnd({
        transactions,
        categories,
        // With categories pinned, only their bills count.
        recurring: pinnedCats
          ? recurring.filter((r) => pinnedCats.includes(r.categoryId))
          : recurring,
        today: asOf,
      }).totalMinor,
    [transactions, categories, recurring, pinnedCats, asOf],
  );
  const planned = current && pins.length === 0;

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
  const scrubEntries = scrubDate ? monthEntries.filter((t) => t.date === scrubDate) : [];
  const order = dashboardOrder(savedOrder);

  const cards: Record<DashboardCard, ReactNode> = {
    safe: planned ? <SafeToSpendCard today={today} /> : null,
    kpis: (
      <>
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
      </>
    ),
    budget: (
      <BudgetCard
        key={month}
        spent={k.spentMinor}
        forecast={forecast}
        dailyAvg={k.dailyAvgMinor}
        today={asOf}
        pinned={pinnedBudget}
      />
    ),
    risk: planned ? <AtRiskCard today={today} /> : null,
    cards: current ? <CardDue /> : null,
    insights: current ? (
      <Insights overallBudgetMinor={pins.length === 0 ? mine.overall : null} />
    ) : null,
    day:
      dayPoints.length > 0 ? (
        <section className="card" aria-labelledby="day-title" data-testid="day-by-day">
          <div className="card-head">
            <h2 id="day-title">Day by day</h2>
            <span className="muted small" aria-live="polite" data-testid="scrub-label">
              {scrubDate ? (
                <>
                  By {fmtDate(scrubDate)}:{' '}
                  <Money minor={dayPoints[scrub!]!.totalMinor} currency={currency} />
                </>
              ) : (
                <>
                  {current ? 'So far' : 'Whole month'}:{' '}
                  <Money minor={dayPoints[dayPoints.length - 1]!.totalMinor} currency={currency} />
                </>
              )}
            </span>
          </div>
          <ScrubChart
            points={dayPoints}
            index={scrub}
            onScrub={setScrub}
            currency={currency}
            label={`${label}, spending added up day by day`}
          />
          {scrubDate ? (
            <>
              {scrubEntries.length > 0 ? (
                <TxList label={`Entries on ${fmtDate(scrubDate)}`} transactions={scrubEntries} />
              ) : (
                <p className="muted small">Nothing spent on {fmtDate(scrubDate)}.</p>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setScrub(null)}>
                Back to {current ? 'today' : 'the whole month'}
              </button>
            </>
          ) : (
            <p className="muted small">
              Point at the line, drag along it, or focus it and use the arrow keys; the donut
              follows.
            </p>
          )}
        </section>
      ) : null,
    charts: (
      <div className="chart-row">
        <section className="card chart-card" aria-labelledby="donut-title">
          <div className="card-head">
            <h2 id="donut-title">Where it went</h2>
            <span className="muted small" aria-live="polite">
              {preview && preview !== month
                ? `Preview: ${monthLabel(preview)}`
                : scrubDate
                  ? `By ${fmtDate(scrubDate)}`
                  : label}
            </span>
          </div>
          <Donut
            totals={totals}
            categories={categories}
            currency={currency}
            caption={
              preview && preview !== month
                ? monthLabel(preview)
                : scrubDate
                  ? `By ${fmtDate(scrubDate).slice(0, -5)}`
                  : current
                    ? 'This month'
                    : label
            }
            selected={donutPath[0]?.slice(2) ?? null}
            legend={donutPath.length === 0}
            legendIds={legendIds}
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
    ),
    sketchbook: doodles ? (
      <Suspense fallback={null}>
        <Sketchbook />
      </Suspense>
    ) : null,
    recent:
      transactions.length === 0 ? (
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
      ),
  };

  const move = (id: DashboardCard, delta: -1 | 1) =>
    void setSetting('dashboardOrder', moveCard(order, id, delta));
  const toggleHidden = (id: DashboardCard) =>
    void setSetting(
      'dashboardHidden',
      hiddenCards.includes(id) ? hiddenCards.filter((h) => h !== id) : [...hiddenCards, id],
    );
  // A long press on a card (touch) opens Customise.
  const pressStart = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || customising) return;
    const x = e.clientX;
    const y = e.clientY;
    press.current = {
      x,
      y,
      timer: window.setTimeout(() => {
        press.current = null;
        setCustomising(true);
      }, LONG_PRESS_MS),
    };
  };
  const pressEnd = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  const pressMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 10) pressEnd();
  };

  return (
    <>
      <InstallBanner />
      <SampleBanner />
      <BackupReminder />
      <QuickAdd followMonth />
      <CheckIn />
      {planned && <MonthCloseCard today={today} />}
      {planned && <RecapCard today={today} />}
      {customising && (
        <section className="card customise-bar" aria-labelledby="customise-title">
          <div className="card-head">
            <h2 id="customise-title">Customise the Dashboard</h2>
            <button type="button" className="btn btn-primary" onClick={() => setCustomising(false)}>
              Done
            </button>
          </div>
          <p className="muted small">
            Move cards up or down, or hide the ones you do not need. Quick add stays first.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              void setSetting('dashboardOrder', []);
              void setSetting('dashboardHidden', []);
            }}
          >
            Reset to the usual layout
          </button>
        </section>
      )}
      {order.map((id, i) => {
        const node = cards[id];
        const isHidden = hiddenCards.includes(id);
        if (!customising) {
          if (isHidden || !node) return null;
          return (
            <div
              key={id}
              className="dash-slot"
              onPointerDown={pressStart}
              onPointerUp={pressEnd}
              onPointerCancel={pressEnd}
              onPointerMove={pressMove}
            >
              {node}
            </div>
          );
        }
        return (
          <div
            key={id}
            className="dash-edit"
            data-testid={`dash-${id}`}
            data-hidden={isHidden || undefined}
          >
            <div className="dash-controls">
              <span className="dash-name">
                {DASHBOARD_CARD_LABEL[id]}
                {!node && !isHidden ? (
                  <span className="muted small"> (nothing to show now)</span>
                ) : null}
              </span>
              <span className="btn-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={i === 0}
                  aria-label={`Move ${DASHBOARD_CARD_LABEL[id]} up`}
                  onClick={() => move(id, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={i === order.length - 1}
                  aria-label={`Move ${DASHBOARD_CARD_LABEL[id]} down`}
                  onClick={() => move(id, 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={!isHidden}
                  aria-label={`Show ${DASHBOARD_CARD_LABEL[id]}`}
                  onClick={() => toggleHidden(id)}
                >
                  {isHidden ? 'Show' : 'Shown'}
                </button>
              </span>
            </div>
            {!isHidden && node && <Fragment>{node}</Fragment>}
          </div>
        );
      })}
      {!customising && (
        <p className="dash-customise">
          <button type="button" className="btn btn-ghost" onClick={() => setCustomising(true)}>
            Customise the Dashboard
          </button>
        </p>
      )}
    </>
  );
}
