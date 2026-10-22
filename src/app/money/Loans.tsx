import { useMemo, useState, type FormEvent } from 'react';
import { useLedger, type LoanDraft } from '../../data/store';
import { fmtDate, parseISO, todayISO } from '../../domain/dates';
import {
  emiFor,
  loanEmi,
  loanStatus,
  MAX_LOAN_MONTHS,
  parseRateBp,
  prepayEffect,
  rateText,
  schedule,
  type Loan,
} from '../../domain/loans';
import { fmtMoney } from '../../domain/money';
import { AmountInput } from '../AmountInput';
import { Icon } from '../icons';
import { Money, usePrivacy } from '../Money';

const EXTRA_STEP = 50_000; // ₹500

function LoanForm({ editing, onDone }: { editing?: Loan; onDone: () => void }) {
  const saveLoan = useLedger((s) => s.saveLoan);
  const currency = useLedger((s) => s.settings.currency);
  usePrivacy();
  const [name, setName] = useState(editing?.name ?? '');
  const [lender, setLender] = useState(editing?.lender ?? '');
  const [principal, setPrincipal] = useState<number | null>(editing?.principalMinor ?? null);
  const [rate, setRate] = useState(editing ? rateText(editing.rateBp) : '');
  const [months, setMonths] = useState(editing ? String(editing.months) : '');
  const [firstDate, setFirstDate] = useState(editing?.firstDate ?? todayISO());
  const [emi, setEmi] = useState<number | null>(editing?.emiMinor ?? null);
  const [error, setError] = useState<string | null>(null);
  const rateBp = parseRateBp(rate);
  const n = Number(months);
  const validMonths = Number.isInteger(n) && n >= 1 && n <= MAX_LOAN_MONTHS;
  const worked = principal && rateBp !== null && validMonths ? emiFor(principal, rateBp, n) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the loan a name');
    if (principal === null || principal <= 0) return setError('Enter the amount borrowed');
    if (rateBp === null) return setError('Enter the yearly interest rate, like 10.5');
    if (!validMonths) return setError(`Enter the number of months, 1 to ${MAX_LOAN_MONTHS}`);
    if (!parseISO(firstDate)) return setError('Pick the date of the first EMI');
    const draft: LoanDraft = {
      name,
      lender: lender.trim(),
      principalMinor: principal,
      rateBp,
      months: n,
      firstDate,
      emiMinor: emi !== null && emi > 0 ? emi : undefined,
    };
    await saveLoan(draft, editing?.id);
    onDone();
  };

  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="loan-name">Name</label>
          <input
            id="loan-name"
            className="input"
            autoComplete="off"
            placeholder="Bike loan"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-lender">Lender</label>
          <input
            id="loan-lender"
            className="input"
            autoComplete="off"
            placeholder="Bank or person"
            value={lender}
            onChange={(e) => setLender(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-principal">Amount borrowed</label>
          <AmountInput id="loan-principal" initialMinor={principal} onChange={setPrincipal} />
        </div>
        <div className="field">
          <label htmlFor="loan-rate">Interest, % a year</label>
          <input
            id="loan-rate"
            className="input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="10.5"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-months">Months</label>
          <input
            id="loan-months"
            className="input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="36"
            value={months}
            onChange={(e) => setMonths(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-first">First EMI date</label>
          <input
            id="loan-first"
            className="input"
            type="date"
            value={firstDate}
            onChange={(e) => setFirstDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-emi">EMI from the bank (optional)</label>
          <AmountInput id="loan-emi" initialMinor={emi} onChange={setEmi} />
        </div>
      </div>
      {worked !== null && (
        <p className="muted small" aria-live="polite" data-testid="loan-emi">
          EMI works out to {fmtMoney(worked, { currency })} a month. If the bank&rsquo;s EMI
          differs, type it above and Ledger uses that.
        </p>
      )}
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary">
          {editing ? 'Save loan' : 'Add loan'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LoanCard({ loan, today }: { loan: Loan; today: string }) {
  const currency = useLedger((s) => s.settings.currency);
  const deleteLoan = useLedger((s) => s.deleteLoan);
  usePrivacy();
  const [extra, setExtra] = useState(0);
  const [editing, setEditing] = useState(false);
  const [all, setAll] = useState(false);
  const status = useMemo(() => loanStatus(loan, today), [loan, today]);
  const rows = useMemo(() => schedule(loan), [loan]);
  const effect = useMemo(() => prepayEffect(loan, extra), [loan, extra]);
  const emi = loanEmi(loan);
  const maxExtra = Math.max(EXTRA_STEP, Math.ceil(emi / EXTRA_STEP) * EXTRA_STEP);
  const shown = all ? rows : rows.slice(0, 12);
  const pct = status.totalCount ? Math.round((status.paidCount / status.totalCount) * 100) : 0;
  const money = (m: number) => fmtMoney(m, { currency });

  if (editing) return <LoanForm editing={loan} onDone={() => setEditing(false)} />;

  return (
    <article className="loan" aria-labelledby={`loan-${loan.id}`} data-testid="loan">
      <div className="card-head">
        <h3 id={`loan-${loan.id}`}>
          {loan.name}
          {loan.lender && <span className="muted small"> · {loan.lender}</span>}
        </h3>
        <span className="muted small">
          {rateText(loan.rateBp)}% a year · {loan.months} months
        </span>
      </div>
      {!status.repays && (
        <p className="warning" role="alert">
          This EMI does not cover the interest, so the loan would never end. Check the EMI.
        </p>
      )}
      <dl className="card-facts">
        <div>
          <dt>EMI</dt>
          <dd>
            <Money minor={emi} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>Left to repay</dt>
          <dd data-testid="loan-left">
            <Money minor={status.remainingMinor} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>Interest still to pay</dt>
          <dd>
            <Money minor={status.interestLeftMinor} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>Next EMI</dt>
          <dd>{status.nextDate ? fmtDate(status.nextDate) : 'None, all paid'}</dd>
        </div>
      </dl>
      <div
        className="loan-progress"
        role="img"
        aria-label={`${status.paidCount} of ${status.totalCount} EMIs paid`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">
        {status.paidCount} of {status.totalCount} EMIs paid
        {status.endDate ? `, ends ${fmtDate(status.endDate)}` : ''}.
      </p>
      <div className="field">
        <label htmlFor={`extra-${loan.id}`}>Pay more each month</label>
        <input
          id={`extra-${loan.id}`}
          type="range"
          className="range"
          min={0}
          max={maxExtra}
          step={EXTRA_STEP}
          value={extra}
          aria-valuetext={`${money(extra)} more each month`}
          onChange={(e) => setExtra(Number(e.target.value))}
        />
        <p className="small" aria-live="polite" data-testid="loan-prepay">
          {extra === 0 ? (
            'Slide to see what paying a little more each month does.'
          ) : (
            <>
              <Money minor={extra} currency={currency} /> more a month ends it{' '}
              {effect.monthsSaved === 1 ? '1 month' : `${effect.monthsSaved} months`} sooner
              {effect.endDate ? ` (${fmtDate(effect.endDate)})` : ''} and saves{' '}
              <Money minor={effect.interestSavedMinor} currency={currency} /> of interest.
            </>
          )}
        </p>
      </div>
      <details className="loan-schedule">
        <summary>Schedule</summary>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`${loan.name} schedule`}>
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Date</th>
                <th scope="col" className="num">
                  Interest
                </th>
                <th scope="col" className="num">
                  Principal
                </th>
                <th scope="col" className="num">
                  Left
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.n} className={r.date <= today ? 'loan-paid' : undefined}>
                  <td>{r.n}</td>
                  <td>{fmtDate(r.date)}</td>
                  <td className="num">
                    <Money minor={r.interestMinor} currency={currency} />
                  </td>
                  <td className="num">
                    <Money minor={r.principalMinor} currency={currency} />
                  </td>
                  <td className="num">
                    <Money minor={r.balanceMinor} currency={currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 12 && (
          <button type="button" className="btn btn-ghost" onClick={() => setAll((v) => !v)}>
            {all ? 'Show the first 12' : `Show all ${rows.length}`}
          </button>
        )}
      </details>
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void deleteLoan(loan.id)}>
          Delete
        </button>
      </div>
    </article>
  );
}

/** Loans and EMIs: where each stands, its schedule, and what paying more would save. */
export function LoansView() {
  const loans = useLedger((s) => s.loans);
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  return (
    <section className="card" aria-labelledby="loans-title">
      <div className="card-head">
        <h2 id="loans-title">Loans and EMIs</h2>
        {!adding && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add loan
          </button>
        )}
      </div>
      {adding && <LoanForm onDone={() => setAdding(false)} />}
      {loans.length === 0 && !adding && (
        <p className="muted small">
          Add a home, bike, education or personal loan to see what is left, the next EMI and what
          paying a little more would save. Track the EMI itself as a recurring payment.
        </p>
      )}
      {loans.map((l) => (
        <LoanCard key={l.id} loan={l} today={today} />
      ))}
    </section>
  );
}
