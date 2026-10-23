import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { safeText, toCsv } from '../../domain/csv';
import { fyOf } from '../../domain/dates';
import { taxCsvRows, taxSummary } from '../../domain/tax';
import type { Transaction } from '../../domain/types';
import { csvFile, ExportButton } from '../files';
import { Money } from '../Money';

/**
 * Tax summary (Drop 12) for the financial year of the report's period: entries tagged with a deduction,
 * per section against the usual old-regime limit. A guide, said plainly.
 */
export function TaxCard({
  transactions,
  date,
}: {
  transactions: readonly Transaction[];
  /** Any day in the year to show. */
  date: string;
}) {
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const fyStart = useLedger((s) => s.settings.fyStartMonth);
  const fy = fyOf(date, fyStart);
  const s = useMemo(
    () => taxSummary(transactions, { start: fy.start, end: fy.end }),
    [transactions, fy.start, fy.end],
  );
  return (
    <section className="card" aria-labelledby="tax-title" data-testid="tax-summary">
      <div className="card-head">
        <h2 id="tax-title">Tax deductions, {fy.label}</h2>
        {s.rows.length > 0 && (
          <ExportButton
            label="Export CSV"
            className="btn btn-ghost"
            build={() =>
              csvFile(
                `ledger-tax-${fy.start}-to-${fy.end}.csv`,
                toCsv(taxCsvRows(s, categories, safeText)),
              )
            }
          />
        )}
      </div>
      {s.rows.length === 0 ? (
        <p className="muted small">
          Mark an entry with a deduction (80C, 80D and so on) in its form under “Who it was for, tax
          and warranty”, or with a rule, and it adds up here for the financial year.
        </p>
      ) : (
        <>
          <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="tax-title">
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col" className="num">
                    Total
                  </th>
                  <th scope="col" className="num">
                    Usual limit
                  </th>
                  <th scope="col" className="num">
                    Counts
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.section.id} data-testid={`tax-${r.section.id}`}>
                    <th scope="row">
                      {r.section.id}
                      <span className="muted small tax-what">
                        {r.section.what}
                        {r.section.note ? `. ${r.section.note}` : ''}
                      </span>
                    </th>
                    <td className="num">
                      <Money minor={r.totalMinor} currency={currency} />
                    </td>
                    <td className="num">
                      {r.section.limitMinor === null ? (
                        'No fixed limit'
                      ) : (
                        <Money minor={r.section.limitMinor} currency={currency} />
                      )}
                    </td>
                    <td className="num">
                      <Money minor={r.countedMinor} currency={currency} />
                      {r.overMinor > 0 && (
                        <span className="status-over small">
                          {' '}
                          (<Money minor={r.overMinor} currency={currency} /> over)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small" data-testid="tax-total">
            Counts in all: <Money minor={s.countedMinor} currency={currency} /> from{' '}
            {s.entries === 1 ? '1 entry' : `${s.entries} entries`}.
          </p>
        </>
      )}
      <p className="muted small">
        A guide, not tax advice. Most of these count only under the old tax regime. From April 2026
        the Income-tax Act, 2025 renumbers them (80C is section 123, 80D section 126). Check the
        limits with your tax adviser.
      </p>
    </section>
  );
}
