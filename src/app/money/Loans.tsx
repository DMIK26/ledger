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
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

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
    if (!name.trim()) return setError(tl('Give the loan a name'));
    if (principal === null || principal <= 0) return setError(tl('Enter the amount borrowed'));
    if (rateBp === null) return setError(tl('Enter the yearly interest rate, like 10.5'));
    if (!validMonths) return setError(tl('Enter the number of months, 1 to {0}', MAX_LOAN_MONTHS));
    if (!parseISO(firstDate)) return setError(tl('Pick the date of the first EMI'));
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
          <label htmlFor="loan-name">{tl('Name')}</label>
          <input
            id="loan-name"
            className="input"
            autoComplete="off"
            placeholder={tl('Bike loan')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-lender">{tl('Lender')}</label>
          <input
            id="loan-lender"
            className="input"
            autoComplete="off"
            placeholder={tl('Bank or person')}
            value={lender}
            onChange={(e) => setLender(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-principal">{tl('Amount borrowed')}</label>
          <AmountInput id="loan-principal" initialMinor={principal} onChange={setPrincipal} />
        </div>
        <div className="field">
          <label htmlFor="loan-rate">{tl('Interest, % a year')}</label>
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
          <label htmlFor="loan-months">{tl('Months')}</label>
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
          <label htmlFor="loan-first">{tl('First EMI date')}</label>
          <input
            id="loan-first"
            className="input"
            type="date"
            value={firstDate}
            onChange={(e) => setFirstDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-emi">{tl('EMI from the bank (optional)')}</label>
          <AmountInput id="loan-emi" initialMinor={emi} onChange={setEmi} />
        </div>
      </div>
      {worked !== null && (
        <p className="muted small" aria-live="polite" data-testid="loan-emi">
          {tl(
            'EMI works out to {0} a month. If the bank’s EMI differs, type it above and Ledger uses that.',
            fmtMoney(worked, { currency }),
          )}
        </p>
      )}
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary">
          {editing ? tl('Save loan') : tl('Add loan')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {tl('Cancel')}
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
          {tl('{0}% a year · {1} months', rateText(loan.rateBp), loan.months)}
        </span>
      </div>
      {!status.repays && (
        <p className="warning" role="alert">
          {tl('This EMI does not cover the interest, so the loan would never end. Check the EMI.')}
        </p>
      )}
      <dl className="card-facts">
        <div>
          <dt>{tl('EMI')}</dt>
          <dd>
            <Money minor={emi} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>{tl('Left to repay')}</dt>
          <dd data-testid="loan-left">
            <Money minor={status.remainingMinor} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>{tl('Interest still to pay')}</dt>
          <dd>
            <Money minor={status.interestLeftMinor} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>{tl('Next EMI')}</dt>
          <dd>{status.nextDate ? fmtDate(status.nextDate) : tl('None, all paid')}</dd>
        </div>
      </dl>
      <div
        className="loan-progress"
        role="img"
        aria-label={tl('{0} of {1} EMIs paid', status.paidCount, status.totalCount)}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">
        {tl(
          '{0} of {1} EMIs paid{2}.',
          status.paidCount,
          status.totalCount,
          status.endDate ? tl(', ends {0}', fmtDate(status.endDate)) : '',
        )}
      </p>
      <div className="field">
        <label htmlFor={`extra-${loan.id}`}>{tl('Pay more each month')}</label>
        <input
          id={`extra-${loan.id}`}
          type="range"
          className="range"
          min={0}
          max={maxExtra}
          step={EXTRA_STEP}
          value={extra}
          aria-valuetext={tl('{0} more each month', money(extra))}
          onChange={(e) => setExtra(Number(e.target.value))}
        />
        <p className="small" aria-live="polite" data-testid="loan-prepay">
          {extra === 0 ? (
            tl('Slide to see what paying a little more each month does.')
          ) : (
            <>
              {tr(
                '{0} more a month ends it {1} sooner{2} and saves {3} of interest.',
                <Money minor={extra} currency={currency} />,
                effect.monthsSaved === 1 ? tl('1 month') : tl('{0} months', effect.monthsSaved),
                effect.endDate ? ` (${fmtDate(effect.endDate)})` : '',
                <Money minor={effect.interestSavedMinor} currency={currency} />,
              )}
            </>
          )}
        </p>
      </div>
      <details className="loan-schedule">
        <summary>{tl('Schedule')}</summary>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label={tl('{0} schedule', loan.name)}
        >
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{tl('Date')}</th>
                <th scope="col" className="num">
                  {tl('Interest')}
                </th>
                <th scope="col" className="num">
                  {tl('Principal')}
                </th>
                <th scope="col" className="num">
                  {tl('Left')}
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
            {all ? tl('Show the first 12') : tl('Show all {0}', rows.length)}
          </button>
        )}
      </details>
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
          {tl('Edit')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void deleteLoan(loan.id)}>
          {tl('Delete')}
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
        <h2 id="loans-title">{tl('Loans and EMIs')}</h2>
        {!adding && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            {tl('Add loan')}
          </button>
        )}
      </div>
      {adding && <LoanForm onDone={() => setAdding(false)} />}
      {loans.length === 0 && !adding && (
        <p className="muted small">
          {tl(
            'Add a home, bike, education or personal loan to see what is left, the next EMI and what paying a little more would save. Track the EMI itself as a recurring payment.',
          )}
        </p>
      )}
      {loans.map((l) => (
        <LoanCard key={l.id} loan={l} today={today} />
      ))}
    </section>
  );
}
