import { useMemo, useState, type ChangeEvent } from 'react';
import { newId, useLedger } from '../../data/store';
import { categoryById } from '../../domain/categories';
import { parseCsv } from '../../domain/csv';
import {
  CSV_FIELDS,
  detectDateOrder,
  guessMapping,
  planCsvImport,
  type CsvField,
  type DateOrder,
  type Mapping,
} from '../../domain/csvImport';
import { fmtDate } from '../../domain/dates';
import { Money } from '../Money';

const LABELS: Record<CsvField, string> = {
  date: 'Date',
  amount: 'Amount',
  merchant: 'What for',
  category: 'Category',
  method: 'Paid by',
  tags: 'Tags',
  notes: 'Notes',
};

/**
 * Imports a spreadsheet or bank CSV: match its columns, preview, then add everything in one undoable
 * step. Rows already in Ledger (same date, amount and merchant) are skipped, and so is money coming in.
 */
export function CsvImport() {
  const categories = useLedger((s) => s.categories);
  const rules = useLedger((s) => s.rules);
  const transactions = useLedger((s) => s.transactions);
  const currency = useLedger((s) => s.settings.currency);
  const lastMethod = useLedger((s) => s.settings.lastMethod);
  const importCsv = useLedger((s) => s.importCsv);
  const [file, setFile] = useState<{ name: string; header: string[]; rows: string[][] } | null>(
    null,
  );
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder>('dmy');
  const [error, setError] = useState<string | null>(null);
  const [stamp] = useState(() => Date.now());

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setError(null);
    if (!f) return;
    const [header, ...rows] = parseCsv(await f.text());
    if (!header || rows.length === 0) {
      setFile(null);
      setError('That file has no rows to import.');
      return;
    }
    const m = guessMapping(header);
    setFile({ name: f.name, header, rows });
    setMapping(m);
    setDateOrder(detectDateOrder(m.date >= 0 ? rows.map((r) => r[m.date] ?? '') : []));
  };

  const plan = useMemo(() => {
    if (!file || !mapping || mapping.date < 0 || mapping.amount < 0) return null;
    return planCsvImport(file.rows, mapping, {
      categories,
      rules,
      existing: transactions,
      currency,
      lastMethod,
      now: stamp,
      newId,
      dateOrder,
    });
  }, [file, mapping, categories, rules, transactions, currency, lastMethod, stamp, dateOrder]);

  const reset = () => {
    setFile(null);
    setMapping(null);
  };

  return (
    <section className="card" aria-labelledby="csv-title">
      <h2 id="csv-title">Import from CSV</h2>
      <p className="muted small">
        From a spreadsheet or your bank&rsquo;s statement export. You match the columns and see what
        will be added before anything changes.
      </p>
      {!file && (
        <label className="btn">
          Choose a CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            onChange={(e) => void onFile(e)}
          />
        </label>
      )}
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      {file && mapping && (
        <div className="csv-import" data-testid="csv-import">
          <p className="small">
            {file.name}: {file.rows.length === 1 ? '1 row' : `${file.rows.length} rows`}.
          </p>
          <div className="form-grid">
            {CSV_FIELDS.map((field) => (
              <div className="field" key={field}>
                <label htmlFor={`map-${field}`}>{LABELS[field]}</label>
                <select
                  id={`map-${field}`}
                  className="select input"
                  value={mapping[field]}
                  onChange={(e) => setMapping({ ...mapping, [field]: Number(e.target.value) })}
                >
                  <option value={-1}>Not in this file</option>
                  {file.header.map((h, i) => (
                    <option key={`${h}-${i}`} value={i}>
                      {h || `Column ${i + 1}`}
                      {file.rows[0]?.[i] ? `, e.g. ${file.rows[0][i]!.slice(0, 24)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="field">
              <label htmlFor="map-order">Dates are written</label>
              <select
                id="map-order"
                className="select input"
                value={dateOrder}
                onChange={(e) => setDateOrder(e.target.value as DateOrder)}
              >
                <option value="dmy">Day first (18/10/2026)</option>
                <option value="mdy">Month first (10/18/2026)</option>
              </select>
            </div>
          </div>
          {!plan ? (
            <p className="errors" role="alert">
              Choose the columns that hold the date and the amount.
            </p>
          ) : (
            <>
              <p role="status" data-testid="csv-summary">
                Ready to add{' '}
                {plan.transactions.length === 1 ? '1 entry' : `${plan.transactions.length} entries`}
                .
                {plan.duplicates > 0 &&
                  ` ${plan.duplicates} already in Ledger ${plan.duplicates === 1 ? 'is' : 'are'} skipped.`}
                {plan.skippedIncome > 0 &&
                  ` ${plan.skippedIncome} ${plan.skippedIncome === 1 ? 'row looks' : 'rows look'} like money coming in and ${plan.skippedIncome === 1 ? 'is' : 'are'} skipped.`}
                {plan.newCategories.length > 0 &&
                  ` New categories: ${plan.newCategories.map((c) => c.name).join(', ')}.`}
              </p>
              {plan.errors.length > 0 && (
                <ul className="errors">
                  {plan.errors.slice(0, 5).map((e) => (
                    <li key={e.row}>{e.message}</li>
                  ))}
                  {plan.errors.length > 5 && <li>and {plan.errors.length - 5} more rows</li>}
                </ul>
              )}
              {plan.transactions.length > 0 && (
                <div
                  className="table-wrap"
                  tabIndex={0}
                  role="region"
                  aria-label="First rows to be added"
                >
                  <table className="report-table">
                    <caption className="visually-hidden">First rows to be added</caption>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">What for</th>
                        <th scope="col">Category</th>
                        <th scope="col" className="num">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.transactions.slice(0, 5).map((t) => (
                        <tr key={t.id}>
                          <td>{fmtDate(t.date)}</td>
                          <td>{t.merchant}</td>
                          <td>
                            {categoryById([...categories, ...plan.newCategories], t.categoryId)
                              ?.name ?? 'Other'}
                          </td>
                          <td className="num">
                            <Money minor={t.amountMinor} currency={currency} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!plan || plan.transactions.length === 0}
              onClick={() => {
                if (plan) void importCsv(plan);
                reset();
              }}
            >
              Import
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
