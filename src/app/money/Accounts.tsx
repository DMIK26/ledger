import { useState, type FormEvent } from 'react';
import { useLedger, type AccountDraft } from '../../data/store';
import {
  ACCOUNT_KIND_LABEL,
  cardStatus,
  defaultMethods,
  type Account,
  type AccountKind,
  type MoneyData,
} from '../../domain/accounts';
import { fmtDate, parseISO, todayISO } from '../../domain/dates';
import { fmtMoney } from '../../domain/money';
import { PAYMENT_METHODS, type PaymentMethod } from '../../domain/types';
import { AmountInput } from '../AmountInput';
import { Icon } from '../icons';
import { Money, usePrivacy } from '../Money';
import { AccountSelect, accountName, useMoneyData } from './shared';

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const KINDS = Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[];

function AccountForm({ editing, onDone }: { editing?: Account; onDone: () => void }) {
  const accounts = useLedger((s) => s.accounts);
  const saveAccount = useLedger((s) => s.saveAccount);
  const [kind, setKind] = useState<AccountKind>(editing?.kind ?? 'bank');
  const [name, setName] = useState(editing?.name ?? '');
  const [opening, setOpening] = useState<number | null>(editing?.openingMinor ?? null);
  const [date, setDate] = useState(editing?.openingDate ?? todayISO());
  const [methods, setMethods] = useState<PaymentMethod[]>(
    editing?.methods ?? defaultMethods('bank', accounts),
  );
  const [statementDay, setStatementDay] = useState(editing?.statementDay ?? 0);
  const [dueDay, setDueDay] = useState(editing?.dueDay ?? 0);
  const [limit, setLimit] = useState<number | null>(editing?.limitMinor ?? null);
  const [error, setError] = useState<string | null>(null);
  const isCard = kind === 'card';

  const pickKind = (k: AccountKind) => {
    setKind(k);
    if (!editing) setMethods(defaultMethods(k, accounts));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the account a name');
    if (!parseISO(date)) return setError('Pick the date the balance is from');
    const draft: AccountDraft = {
      name,
      kind,
      openingMinor: opening ?? 0,
      openingDate: date,
      methods,
      statementDay: isCard && statementDay ? statementDay : undefined,
      dueDay: isCard && dueDay ? dueDay : undefined,
      limitMinor: isCard && limit !== null && limit > 0 ? limit : undefined,
    };
    await saveAccount(draft, editing?.id);
    onDone();
  };

  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="acc-kind">Type</label>
          <select
            id="acc-kind"
            className="select input"
            value={kind}
            disabled={editing !== undefined}
            onChange={(e) => pickKind(e.target.value as AccountKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {ACCOUNT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="acc-name">Name</label>
          <input
            id="acc-name"
            className="input"
            autoComplete="off"
            placeholder={isCard ? 'SBI card' : kind === 'cash' ? 'Wallet cash' : 'HDFC savings'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="acc-opening">
            {isCard ? 'Owed on that date' : 'Balance on that date'}
          </label>
          <AmountInput id="acc-opening" initialMinor={opening} onChange={setOpening} />
        </div>
        <div className="field">
          <label htmlFor="acc-date">Balance date</label>
          <input
            id="acc-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {isCard && (
          <>
            <div className="field">
              <label htmlFor="acc-statement">Statement day</label>
              <select
                id="acc-statement"
                className="select input"
                value={statementDay}
                onChange={(e) => setStatementDay(Number(e.target.value))}
              >
                <option value={0}>Not set</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="acc-due">Payment due day</label>
              <select
                id="acc-due"
                className="select input"
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
              >
                <option value={0}>Not set</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="acc-limit">Credit limit (optional)</label>
              <AmountInput id="acc-limit" initialMinor={limit} onChange={setLimit} />
            </div>
          </>
        )}
      </div>
      <fieldset className="method-picks">
        <legend>Entries paid by these come out of this account</legend>
        {PAYMENT_METHODS.map((m) => (
          <label key={m} className="check">
            <input
              type="checkbox"
              checked={methods.includes(m)}
              onChange={(e) =>
                setMethods((list) =>
                  e.target.checked ? [...list, m] : list.filter((x) => x !== m),
                )
              }
            />
            {m}
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary">
          {editing ? 'Save account' : 'Add account'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function TransferForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const accounts = useLedger((s) => s.accounts);
  const addTransfer = useLedger((s) => s.addTransfer);
  const isCard = account.kind === 'card';
  // Paying a card moves money into it; from anything else, money moves out.
  const others = accounts.filter((a) => a.id !== account.id && !a.archived);
  const [other, setOther] = useState(
    (isCard ? others.find((a) => a.kind === 'bank') : others[0])?.id ?? '',
  );
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const uid = `tr-${account.id}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!other) return setError('Pick the other account');
    if (amount === null || amount <= 0) return setError('Enter an amount above zero');
    await addTransfer(
      isCard
        ? { fromId: other, toId: account.id, amountMinor: amount, date }
        : { fromId: account.id, toId: other, amountMinor: amount, date },
    );
    onDone();
  };

  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${uid}-other`}>{isCard ? 'Pay from' : 'Move to'}</label>
          <AccountSelect
            id={`${uid}-other`}
            value={other}
            onChange={setOther}
            accounts={accounts}
            allowNone={false}
            exclude={account.id}
            filter={isCard ? (a) => a.kind !== 'card' : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-amount`}>Amount</label>
          <AmountInput id={`${uid}-amount`} initialMinor={null} onChange={setAmount} />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-date`}>Date</label>
          <input
            id={`${uid}-date`}
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
          {isCard ? 'Record payment' : 'Move money'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function FeeForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const addFee = useLedger((s) => s.addFee);
  const [amount, setAmount] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const uid = `fee-${account.id}`;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (amount === null || amount <= 0) return setError('Enter an amount above zero');
    await addFee({ accountId: account.id, amountMinor: amount, date, label: label || 'Interest' });
    onDone();
  };
  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <p className="muted small">
        Interest and fees raise what is owed and show in cash flow, but never count as spending.
      </p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${uid}-label`}>What it was</label>
          <input
            id={`${uid}-label`}
            className="input"
            autoComplete="off"
            placeholder="Interest, late fee, annual fee"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-amount`}>Amount</label>
          <AmountInput id={`${uid}-amount`} initialMinor={null} onChange={setAmount} />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-date`}>Date</label>
          <input
            id={`${uid}-date`}
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
          Add interest or fee
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CashCheck({
  account,
  expected,
  onDone,
}: {
  account: Account;
  expected: number;
  onDone: () => void;
}) {
  const resolve = useLedger((s) => s.resolveCashCheck);
  const currency = useLedger((s) => s.settings.currency);
  usePrivacy();
  const [counted, setCounted] = useState<number | null>(null);
  const diff = counted === null ? null : counted - expected;
  const uid = `cash-${account.id}`;
  const act = async (mode: 'spending' | 'adjust') => {
    if (counted === null) return;
    await resolve(account.id, counted, mode);
    onDone();
  };
  return (
    <div className="entry-form cash-check">
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${uid}-counted`}>Cash you have now</label>
          <AmountInput id={`${uid}-counted`} initialMinor={null} onChange={setCounted} />
        </div>
      </div>
      <p className="small" aria-live="polite" data-testid="cash-check-result">
        Ledger expects <Money minor={expected} currency={currency} />.
        {diff !== null && diff === 0 && ' That matches.'}
        {diff !== null && diff < 0 && (
          <>
            {' '}
            You have <Money minor={-diff} currency={currency} /> less, probably spending that was
            not logged.
          </>
        )}
        {diff !== null && diff > 0 && (
          <>
            {' '}
            You have <Money minor={diff} currency={currency} /> more than expected.
          </>
        )}
      </p>
      <div className="btn-row">
        {diff !== null && diff < 0 && (
          <button type="button" className="btn btn-primary" onClick={() => void act('spending')}>
            Record {fmtMoney(-diff, { currency })} as spending
          </button>
        )}
        {diff !== null && diff !== 0 && (
          <button type="button" className="btn" onClick={() => void act('adjust')}>
            Only correct the balance
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Close
        </button>
      </div>
    </div>
  );
}

/** What a card owes, the last statement and when it is due. */
export function CardSummary({
  card,
  data,
  today,
}: {
  card: Account;
  data: MoneyData;
  today: string;
}) {
  const accounts = useLedger((s) => s.accounts);
  const currency = useLedger((s) => s.settings.currency);
  const s = cardStatus(card, accounts, data, today);
  return (
    <dl className="card-facts" data-testid={`card-${card.id}`}>
      <div>
        <dt>Owed now</dt>
        <dd>
          <Money minor={s.owedMinor} currency={currency} />
        </dd>
      </div>
      {s.statementDate && (
        <div>
          <dt>Statement of {fmtDate(s.statementDate)}</dt>
          <dd>
            <Money minor={s.statementMinor} currency={currency} />
          </dd>
        </div>
      )}
      {s.statementDate && s.dueDate && (
        <div>
          <dt>Due {fmtDate(s.dueDate)}</dt>
          <dd className={s.overdue ? 'status-over' : undefined}>
            {s.dueMinor === 0 ? (
              'Paid'
            ) : (
              <>
                <Money minor={s.dueMinor} currency={currency} />
                <span className="small">
                  {s.overdue
                    ? `, overdue by ${-(s.daysToDue ?? 0)} ${s.daysToDue === -1 ? 'day' : 'days'}`
                    : s.daysToDue === 0
                      ? ', due today'
                      : `, in ${s.daysToDue} ${s.daysToDue === 1 ? 'day' : 'days'}`}
                </span>
              </>
            )}
          </dd>
        </div>
      )}
      {s.availableMinor !== null && (
        <div>
          <dt>Limit left</dt>
          <dd>
            <Money minor={s.availableMinor} currency={currency} />
          </dd>
        </div>
      )}
    </dl>
  );
}

type Panel = 'transfer' | 'fee' | 'cash' | 'edit' | null;

function AccountRow({
  account,
  balance,
  data,
  today,
}: {
  account: Account;
  balance: number;
  data: MoneyData;
  today: string;
}) {
  const currency = useLedger((s) => s.settings.currency);
  const setArchived = useLedger((s) => s.setAccountArchived);
  const deleteAccount = useLedger((s) => s.deleteAccount);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [blocked, setBlocked] = useState(false);
  const isCard = account.kind === 'card';
  const close = () => setPanel(null);

  return (
    <li
      className={`account-row${account.archived ? ' account-archived' : ''}`}
      data-testid="account-row"
    >
      <button
        type="button"
        className="account-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="money-main">
          <span>{account.name}</span>
          <span className="muted small">
            {ACCOUNT_KIND_LABEL[account.kind]}
            {account.methods.length > 0 ? ` · used for ${account.methods.join(', ')}` : ''}
            {account.archived ? ' · archived' : ''}
          </span>
        </span>
        <span className="account-balance">
          {isCard ? (
            <>
              <span className="muted small">Owed </span>
              <Money minor={Math.max(0, -balance)} currency={currency} />
            </>
          ) : (
            <Money minor={balance} currency={currency} />
          )}
        </span>
      </button>
      {open && (
        <div className="account-panel">
          {isCard && <CardSummary card={account} data={data} today={today} />}
          {panel === null && (
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => setPanel('transfer')}>
                {isCard ? 'Pay this card' : 'Move money'}
              </button>
              {account.kind === 'cash' && (
                <button type="button" className="btn" onClick={() => setPanel('cash')}>
                  Check cash
                </button>
              )}
              {(isCard || account.kind === 'bank') && (
                <button type="button" className="btn" onClick={() => setPanel('fee')}>
                  Interest or fee
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setPanel('edit')}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void setArchived(account.id, !account.archived)}
              >
                {account.archived ? 'Bring back' : 'Archive'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void deleteAccount(account.id).then((ok) => setBlocked(!ok))}
              >
                Delete
              </button>
            </div>
          )}
          {blocked && (
            <p className="muted small" role="status">
              Entries use this account, so it cannot be deleted. Archive it to hide it from lists;
              its history stays.
            </p>
          )}
          {panel === 'transfer' && <TransferForm account={account} onDone={close} />}
          {panel === 'fee' && <FeeForm account={account} onDone={close} />}
          {panel === 'cash' && <CashCheck account={account} expected={balance} onDone={close} />}
          {panel === 'edit' && <AccountForm editing={account} onDone={close} />}
        </div>
      )}
    </li>
  );
}

/** Bank accounts, cash, wallets and cards, with balances worked out from everything logged. */
export function AccountsCard() {
  const { accounts, flows, data, balanceOf, today } = useMoneyData();
  const currency = useLedger((s) => s.settings.currency);
  const deleteFlow = useLedger((s) => s.deleteFlow);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const visible = accounts.filter((a) => showArchived || !a.archived);
  const total = accounts.reduce((s, a) => s + (balanceOf[a.id] ?? 0), 0);
  const moves = flows.filter((f) => f.kind !== 'income').slice(0, 8);

  return (
    <section className="card" aria-labelledby="accounts-title">
      <div className="card-head">
        <h2 id="accounts-title">Accounts</h2>
        {!adding && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add account
          </button>
        )}
      </div>
      {adding && <AccountForm onDone={() => setAdding(false)} />}
      {accounts.length === 0 && !adding && (
        <p className="muted small">
          Add your bank account, cash and cards to see balances. Each payment method belongs to one
          account, so the entries you already have count straight away.
        </p>
      )}
      {visible.length > 0 && (
        <ul className="account-list" aria-label="Accounts">
          {visible.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              balance={balanceOf[a.id] ?? 0}
              data={data}
              today={today}
            />
          ))}
        </ul>
      )}
      {accounts.length > 0 && (
        <p className="account-total">
          <span>All accounts, cards taken off</span>
          <Money minor={total} currency={currency} />
        </p>
      )}
      {accounts.some((a) => a.archived) && (
        <button type="button" className="btn btn-ghost" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide archived accounts' : 'Show archived accounts'}
        </button>
      )}
      {moves.length > 0 && (
        <>
          <h3 className="small">Transfers, fees and corrections</h3>
          <ul className="money-list" aria-label="Transfers, fees and corrections">
            {moves.map((f) => (
              <li key={f.id} className="money-row">
                <span className="money-main">
                  <span>{f.label}</span>
                  <span className="muted small">
                    {fmtDate(f.date)} ·{' '}
                    {f.kind === 'transfer'
                      ? `${accountName(accounts, f.accountId)} to ${accountName(accounts, f.toAccountId)}`
                      : accountName(accounts, f.accountId)}
                  </span>
                </span>
                <Money minor={f.amountMinor} currency={currency} signed={f.kind === 'adjust'} />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Delete ${f.label} on ${fmtDate(f.date)}`}
                  onClick={() => void deleteFlow(f.id)}
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
