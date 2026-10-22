import { EmptyDoodle } from '../../doodle/Studio';
import { useMemo, useState } from 'react';
import { Heatmap } from '../../charts/Heatmap';
import { Sparkline } from '../../charts/Sparkline';
import { useLedger } from '../../data/store';
import { categoryById } from '../../domain/categories';
import { safeText, toCsv } from '../../domain/csv';
import { exportRows } from '../../domain/csvImport';
import { fmtDate, todayISO, WEEKDAYS } from '../../domain/dates';
import { CURRENCIES } from '../../domain/money';
import {
  customPeriod,
  periodFor,
  previousPeriod,
  sameLastYear,
  toDate,
  type PeriodKind,
} from '../../domain/periods';
import { averageWindow, buildReport, inRange, scaleCompare } from '../../domain/reports';
import { diffDays, monthKey, shiftMonthKey } from '../../domain/dates';
import { moneyFlow, type FlowNode } from '../../domain/flow';
import { normalizeMerchantKey } from '../../domain/categoriser';
import { monthRecap } from '../../domain/recap';
import { FlowChart } from '../../charts/FlowChart';
import { Treemap } from '../../charts/Treemap';
import { fillFor } from '../../charts/fills';
import { useUi } from '../../kit/ui';
import { csvFile, ExportButton } from '../files';
import { useScopedTransactions, useView } from '../../kit/view';
import { Money } from '../Money';
import { href } from '../router';

const KINDS: Array<{ value: PeriodKind; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'fy', label: 'Financial year' },
  { value: 'custom', label: 'Custom' },
];

type CompareMode = 'previous' | 'lastYear' | 'average';

function Change({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="muted">No comparison</span>;
  if (pct === 0) return <span>Same</span>;
  return (
    <span className={pct > 0 ? 'status-over' : undefined}>
      {Math.abs(pct)}% {pct > 0 ? 'more' : 'less'}
    </span>
  );
}

const pctChange = (now: number, before: number): number | null =>
  before > 0 ? Math.round(((now - before) / before) * 100) : null;

function Bars({
  rows,
  currency,
}: {
  rows: Array<{ key: string; label: string; value: number; note?: string }>;
  currency: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.key} className="hbar">
          <span className="hbar-label">{r.label}</span>
          <Money minor={r.value} currency={currency} />
          {r.note && <span className="muted small hbar-note">{r.note}</span>}
          <span className="hbar-track" aria-hidden="true">
            <span className="hbar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Reports() {
  const transactions = useScopedTransactions();
  const togglePin = useView((s) => s.togglePin);
  const categories = useLedger((s) => s.categories);
  const flows = useLedger((s) => s.flows);
  const openRecap = useUi((s) => s.openRecap);
  const [treeCat, setTreeCat] = useState<string | null>(null);
  const [flowCat, setFlowCat] = useState<string | null>(null);
  const currency = useLedger((s) => s.settings.currency);
  const fyStart = useLedger((s) => s.settings.fyStartMonth);
  const today = todayISO();

  const [kind, setKind] = useState<PeriodKind>('month');
  const [offset, setOffset] = useState(0);
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [compareMode, setCompareMode] = useState<CompareMode>('previous');

  const period =
    kind === 'custom' ? customPeriod(from, to) : periodFor(kind, today, fyStart, offset);
  const comparePeriod =
    compareMode === 'lastYear' ? sameLastYear(period, fyStart) : previousPeriod(period, fyStart);
  const span = toDate(period, comparePeriod, today);
  const report = useMemo(() => {
    if (compareMode === 'average') {
      // The 12 months before the period, scaled to the period's days so far.
      const window = averageWindow(period.start);
      return scaleCompare(
        buildReport(transactions, { start: period.start, end: span.end }, window),
        diffDays(span.end, period.start) + 1,
      );
    }
    return buildReport(
      transactions,
      { start: period.start, end: span.end },
      { start: comparePeriod.start, end: span.compareEnd },
    );
  }, [transactions, period.start, span.end, comparePeriod.start, span.compareEnd, compareMode]);
  const flow = useMemo(
    () =>
      moneyFlow({
        transactions,
        flows,
        categories,
        start: period.start,
        end: span.end,
        expand: flowCat,
      }),
    [transactions, flows, categories, period.start, span.end, flowCat],
  );
  const treeTiles = useMemo(() => {
    const range = inRange(transactions, period.start, span.end);
    if (treeCat) {
      const c = categories.find((x) => x.id === treeCat);
      const byM = new Map<string, { label: string; value: number }>();
      for (const t of range) {
        if (t.categoryId !== treeCat) continue;
        const key = normalizeMerchantKey(t.merchant) || 'untitled';
        const m = byM.get(key) ?? { label: t.merchant || 'Untitled', value: 0 };
        m.value += t.amountMinor;
        byM.set(key, m);
      }
      return [...byM.entries()]
        .sort((a, b) => b[1].value - a[1].value)
        .map(([id, m]) => ({ id, label: m.label, valueMinor: m.value, color: fillFor(c) }));
    }
    return report.categories
      .filter((r) => r.totalMinor > 0)
      .map((r) => {
        const c = categoryById(categories, r.categoryId);
        return {
          id: r.categoryId,
          label: c?.name ?? 'Other',
          valueMinor: r.totalMinor,
          color: fillFor(c),
        };
      });
  }, [transactions, period.start, span.end, treeCat, categories, report.categories]);
  const flowColor = (n: FlowNode): string =>
    n.kind === 'category'
      ? fillFor(categoryById(categories, n.categoryId!))
      : n.kind === 'income'
        ? 'var(--green)'
        : n.kind === 'left'
          ? 'var(--sand)'
          : n.kind === 'merchant'
            ? fillFor(categoryById(categories, flowCat ?? ''))
            : 'var(--faint)';
  const symbol = (CURRENCIES[currency] ?? CURRENCIES.INR!).symbol;
  const name = (id: string) => categoryById(categories, id)?.name ?? 'Other';

  return (
    <div className="report">
      <section className="card report-controls no-print" aria-label="Report period">
        <div className="segmented" role="group" aria-label="Period">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => {
                setKind(k.value);
                setOffset(0);
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
        {kind === 'custom' ? (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="r-from">From</label>
              <input
                id="r-from"
                className="input"
                type="date"
                value={from}
                max={to}
                onChange={(e) => e.target.value && setFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="r-to">To</label>
              <input
                id="r-to"
                className="input"
                type="date"
                value={to}
                min={from}
                onChange={(e) => e.target.value && setTo(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="period-nav">
            <button type="button" className="btn" onClick={() => setOffset((o) => o - 1)}>
              Previous
            </button>
            <span className="period-label" aria-live="polite">
              {period.label}
            </span>
            <button
              type="button"
              className="btn"
              disabled={offset >= 0}
              onClick={() => setOffset((o) => o + 1)}
            >
              Next
            </button>
          </div>
        )}
        <div className="field-row">
          <span className="small">Compare with</span>
          <div className="segmented" role="group" aria-label="Compare with">
            <button
              type="button"
              aria-pressed={compareMode === 'previous'}
              onClick={() => setCompareMode('previous')}
            >
              Previous period
            </button>
            <button
              type="button"
              aria-pressed={compareMode === 'lastYear'}
              onClick={() => setCompareMode('lastYear')}
            >
              Same period last year
            </button>
            <button
              type="button"
              aria-pressed={compareMode === 'average'}
              onClick={() => setCompareMode('average')}
            >
              12-month average
            </button>
          </div>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setKind('fy');
              setOffset(0);
              setCompareMode('lastYear');
            }}
          >
            Year to date against last year
          </button>
          {kind === 'month' && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => openRecap(monthRecap(shiftMonthKey(monthKey(today), offset)))}
            >
              Story recap
            </button>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="summary-title">
        <div className="card-head">
          <h2 id="summary-title">{period.label}</h2>
          <span className="muted small">
            {fmtDate(report.start)} to {fmtDate(report.end)}
          </span>
        </div>
        <p className="big-figure" data-testid="report-total">
          <Money minor={report.totalMinor} currency={currency} />
        </p>
        <p className="small" data-testid="report-compare">
          {report.changePct === null ? (
            <>
              Nothing to compare with in {fmtDate(report.compareStart)} to{' '}
              {fmtDate(report.compareEnd)}.
            </>
          ) : (
            <>
              <Change pct={report.changePct} /> than{' '}
              {compareMode === 'average' ? (
                <>
                  the average of {fmtDate(report.compareStart)} to {fmtDate(report.compareEnd)} for
                  the same number of days (
                  <Money minor={report.compareMinor} currency={currency} />)
                </>
              ) : (
                <>
                  {fmtDate(report.compareStart)} to {fmtDate(report.compareEnd)} (
                  <Money minor={report.compareMinor} currency={currency} />)
                  {span.partial && ', comparing the same number of days so far'}
                </>
              )}
              .
            </>
          )}
        </p>
        <p className="muted small">
          {report.entries === 1 ? '1 entry' : `${report.entries} entries`}
        </p>
        <div className="btn-row no-print">
          <ExportButton
            label="Export CSV"
            disabled={report.entries === 0}
            build={() =>
              csvFile(
                `ledger-${period.start}-to-${report.end}.csv`,
                toCsv(
                  exportRows(
                    inRange(transactions, period.start, report.end).sort((a, b) =>
                      a.date.localeCompare(b.date),
                    ),
                    categories,
                    safeText,
                    symbol,
                  ),
                ),
              )
            }
          />
          <button type="button" className="btn" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </div>
      </section>

      {report.entries === 0 ? (
        <section className="card empty">
          <EmptyDoodle art="chart" />
          <h2>Nothing in this period</h2>
          <p className="muted">
            Pick another period above, or <a href={href('/transactions')}>add entries</a>.
          </p>
        </section>
      ) : (
        <>
          <section className="card" aria-labelledby="cat-table-title">
            <h2 id="cat-table-title">By category</h2>
            {/* Focusable so the table can be scrolled sideways with the keyboard on narrow screens. */}
            <div
              className="table-wrap"
              tabIndex={0}
              role="region"
              aria-labelledby="cat-table-title"
            >
              <table className="report-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" className="num">
                      Spent
                    </th>
                    <th scope="col" className="num">
                      Share
                    </th>
                    <th scope="col" className="num">
                      Compared
                    </th>
                    <th scope="col" className="num">
                      Change
                    </th>
                    <th scope="col">Last six months</th>
                  </tr>
                </thead>
                <tbody>
                  {report.categories.map((r) => {
                    const c = categoryById(categories, r.categoryId);
                    return (
                      <tr key={r.categoryId} data-testid={`report-row-${r.categoryId}`}>
                        <th scope="row">
                          <span
                            className="dot"
                            style={{ background: c?.color ?? 'var(--faint)' }}
                          />
                          {name(r.categoryId)}
                        </th>
                        <td className="num">
                          <Money minor={r.totalMinor} currency={currency} />
                        </td>
                        <td className="num">{Math.round(r.share * 100)}%</td>
                        <td className="num">
                          <Money minor={r.compareMinor} currency={currency} />
                        </td>
                        <td className="num">
                          <Change pct={pctChange(r.totalMinor, r.compareMinor)} />
                        </td>
                        <td>
                          <Sparkline values={r.series} color={c?.color} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" aria-labelledby="tree-title">
            <div className="card-head">
              <h2 id="tree-title">
                {treeCat
                  ? `${categoryById(categories, treeCat)?.name ?? 'Other'}, by merchant`
                  : 'Where it went'}
              </h2>
              {treeCat && (
                <button type="button" className="btn btn-ghost" onClick={() => setTreeCat(null)}>
                  Back to all categories
                </button>
              )}
            </div>
            <Treemap
              tiles={treeTiles}
              currency={currency}
              label={treeCat ? 'Merchants' : 'Categories'}
              onPick={treeCat ? undefined : (id) => setTreeCat(id)}
            />
          </section>

          <section className="card" aria-labelledby="flow-title">
            <div className="card-head">
              <h2 id="flow-title">Money flow</h2>
              <span className="muted small">
                <Money minor={flow.inMinor} currency={currency} /> in,{' '}
                <Money minor={flow.spentMinor} currency={currency} /> spent
              </span>
            </div>
            <FlowChart
              flow={flow}
              colorOf={flowColor}
              currency={currency}
              expanded={flowCat}
              onExpand={setFlowCat}
            />
          </section>

          <div className="report-grid">
            <section className="card" aria-labelledby="merchants-title">
              <h2 id="merchants-title">Top merchants</h2>
              <Bars
                currency={currency}
                rows={report.merchants.map((m) => ({
                  key: m.merchant,
                  label: m.merchant,
                  value: m.totalMinor,
                  note: m.count === 1 ? '1 entry' : `${m.count} entries`,
                }))}
              />
            </section>
            <section className="card" aria-labelledby="methods-title">
              <h2 id="methods-title">Paid by</h2>
              <Bars
                currency={currency}
                rows={report.methods.map((m) => ({
                  key: m.method,
                  label: m.method,
                  value: m.totalMinor,
                  note: `${Math.round((m.totalMinor / Math.max(1, report.totalMinor)) * 100)}%`,
                }))}
              />
            </section>
          </div>

          <section className="card" aria-labelledby="weekday-title">
            <h2 id="weekday-title">Average by weekday</h2>
            <Bars
              currency={currency}
              rows={report.weekdays.map((w) => ({
                key: String(w.weekday),
                label: WEEKDAYS[w.weekday]!,
                value: w.averageMinor,
              }))}
            />
          </section>

          <section className="card" aria-labelledby="heat-title">
            <h2 id="heat-title">Day by day</h2>
            <Heatmap
              days={report.days}
              currency={currency}
              onRange={(a, b) => {
                setFrom(a);
                setTo(b);
                setKind('custom');
              }}
              onPick={(date) => togglePin({ kind: 'day', id: date, label: fmtDate(date) })}
            />
            <p className="muted small no-print">
              Drag across days to report on just those; click a day to pin it to every page.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
