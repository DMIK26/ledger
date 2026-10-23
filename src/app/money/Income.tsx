import { useState, type FormEvent } from 'react';
import { useLedger } from '../../data/store';
import {
  accountForMethod,
  INCOME_KINDS,
  incomeKindFor,
  type IncomeKind,
} from '../../domain/accounts';
import { fmtDate, monthBounds, monthKey, parseISO, todayISO } from '../../domain/dates';
import { useViewMonth } from '../../kit/view';
import { AmountInput } from '../AmountInput';
import { Icon } from '../icons';
import { Money } from '../Money';
import { AccountSelect, accountName } from './shared';
import { tl } from '../../domain/i18n';

function IncomeForm({ onDone }: { onDone: () => void }) {
  const accounts = useLedger((s) => s.accounts);
  const addIncome = useLedger((s) => s.addIncome);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState<IncomeKind>('salary');
  const [kindTouched, setKindTouched] = useState(false);
  const [accountId, setAccountId] = useState(
    accountForMethod(accounts, 'Bank transfer')?.id ?? '',
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (amount === null || amount <= 0) return setError(tl('Enter an amount above zero'));
    if (!parseISO(date)) return setError(tl('Pick a valid date'));
    await addIncome({
      date,
      amountMinor: amount,
      label: label.trim() || INCOME_KINDS[kind],
      incomeKind: kind,
      accountId: accountId || undefined,
    });
    onDone();
  };

  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="in-amount">{tl('Amount')}</label>
          <AmountInput id="in-amount" initialMinor={null} onChange={setAmount} />
        </div>
        <div className="field">
          <label htmlFor="in-label">{tl('From or for')}</label>
          <input
            id="in-label"
            className="input"
            autoComplete="off"
            placeholder={tl('October salary')}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (!kindTouched)
                setKind(e.target.value.trim() ? incomeKindFor(e.target.value) : 'salary');
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="in-kind">{tl('Kind')}</label>
          <select
            id="in-kind"
            className="select input"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as IncomeKind);
              setKindTouched(true);
            }}
          >
            {(Object.keys(INCOME_KINDS) as IncomeKind[]).map((k) => (
              <option key={k} value={k}>
                {INCOME_KINDS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="in-date">{tl('Date')}</label>
          <input
            id="in-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="in-account">{tl('Into')}</label>
          <AccountSelect
            id="in-account"
            value={accountId}
            onChange={setAccountId}
            accounts={accounts}
          />
        </div>
      </div>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary">
          {tl('Add money in')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {tl('Cancel')}
        </button>
      </div>
    </form>
  );
}

/** Money in for the month on screen. It never counts as spending. */
export function IncomeCard() {
  const flows = useLedger((s) => s.flows);
  const accounts = useLedger((s) => s.accounts);
  const currency = useLedger((s) => s.settings.currency);
  const deleteFlow = useLedger((s) => s.deleteFlow);
  const month = useViewMonth();
  const [adding, setAdding] = useState(false);
  const list = flows.filter((f) => f.kind === 'income' && monthKey(f.date) === month);
  const { start, end } = monthBounds(month);

  return (
    <section className="card" aria-labelledby="income-title">
      <div className="card-head">
        <h2 id="income-title">{tl('Money in')}</h2>
        {!adding && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            {tl('Add money in')}
          </button>
        )}
      </div>
      {adding && <IncomeForm onDone={() => setAdding(false)} />}
      {list.length === 0 ? (
        <p className="muted small">
          {tl(
            'Nothing between {0} and {1}. Salary, refunds, interest and gifts go here, never into spending.',
            fmtDate(start),
            fmtDate(end),
          )}
        </p>
      ) : (
        <ul className="money-list" aria-label={tl('Money in this month')}>
          {list.map((f) => (
            <li key={f.id} className="money-row">
              <span className="money-main">
                <span>{f.label}</span>
                <span className="muted small">
                  {fmtDate(f.date)} · {INCOME_KINDS[f.incomeKind ?? 'other']} ·{' '}
                  {accountName(accounts, f.accountId)}
                </span>
              </span>
              <Money minor={f.amountMinor} currency={currency} className="money-in" />
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={tl('Delete {0} on {1}', f.label, fmtDate(f.date))}
                onClick={() => void deleteFlow(f.id)}
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
