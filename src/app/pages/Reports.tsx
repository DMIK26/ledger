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
import { buildReport, inRange } from '../../domain/reports';
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

type CompareMode = 'previous' | 'lastYear';

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
    compareMode === 'previous' ? previousPeriod(period, fyStart) : sameLastYear(period, fyStart);
  const span = toDate(period, comparePeriod, today);
  const report = useMemo(
    () =>
      buildReport(
        transactions,
        { start: period.start, end: span.end },
        { start: comparePeriod.start, end: span.compareEnd },
      ),
    [transactions, period.start, span.end, comparePeriod.start, span.compareEnd],
  );
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
          </div>
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
              <Change pct={report.changePct} /> than {fmtDate(report.compareStart)} to{' '}
              {fmtDate(report.compareEnd)} (
              <Money minor={report.compareMinor} currency={currency} />)
              {span.partial && ', comparing the same number of days so far'}.
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
            <div className="table-wrap">
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
