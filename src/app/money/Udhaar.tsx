import { useState, type FormEvent } from 'react';
import { useLedger } from '../../data/store';
import { fmtDate, parseISO, todayISO } from '../../domain/dates';
import {
  reminderText,
  settleKind,
  UDHAAR_LABEL,
  udhaarSummary,
  udhaarTotals,
  type PersonSummary,
  type UdhaarKind,
} from '../../domain/udhaar';
import { AmountInput } from '../AmountInput';
import { Icon } from '../icons';
import { Money, usePrivacy } from '../Money';
import { AccountSelect } from './shared';

const KINDS = Object.keys(UDHAAR_LABEL) as UdhaarKind[];

function UdhaarForm({
  personName = '',
  kind: startKind = 'lent',
  amountMinor = null,
  onDone,
}: {
  personName?: string;
  kind?: UdhaarKind;
  amountMinor?: number | null;
  onDone: () => void;
}) {
  const people = useLedger((s) => s.people);
  const accounts = useLedger((s) => s.accounts);
  const saveUdhaar = useLedger((s) => s.saveUdhaar);
  const [name, setName] = useState(personName);
  const [kind, setKind] = useState<UdhaarKind>(startKind);
  const [amount, setAmount] = useState<number | null>(amountMinor);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Who is it with?');
    if (amount === null || amount <= 0) return setError('Enter an amount above zero');
    if (!parseISO(date)) return setError('Pick a valid date');
    await saveUdhaar({
      personName: name,
      kind,
      date,
      amountMinor: amount,
      note,
      accountId: accountId || undefined,
    });
    onDone();
  };

  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ud-person">Person</label>
          <input
            id="ud-person"
            className="input"
            autoComplete="off"
            list="ud-people"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <datalist id="ud-people">
            {people.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="ud-kind">What happened</label>
          <select
            id="ud-kind"
            className="select input"
            value={kind}
            onChange={(e) => setKind(e.target.value as UdhaarKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {UDHAAR_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ud-amount">Amount</label>
          <AmountInput id="ud-amount" initialMinor={amount} onChange={setAmount} />
        </div>
        <div className="field">
          <label htmlFor="ud-date">Date</label>
          <input
            id="ud-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ud-note">Note</label>
          <input
            id="ud-note"
            className="input"
            autoComplete="off"
            placeholder="Movie tickets"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ud-account">Account</label>
          <AccountSelect
            id="ud-account"
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
          Save
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PersonRow({ summary }: { summary: PersonSummary }) {
  const udhaar = useLedger((s) => s.udhaar);
  const currency = useLedger((s) => s.settings.currency);
  const deleteUdhaar = useLedger((s) => s.deleteUdhaar);
  const deletePerson = useLedger((s) => s.deletePerson);
  const masked = usePrivacy();
  const [open, setOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const { person, balanceMinor } = summary;
  const entries = udhaar.filter((e) => e.personId === person.id);
  const settle = settleKind(balanceMinor);
  const firstOpen = [...entries].reverse().find((e) => e.kind === 'lent')?.date ?? summary.lastDate;

  const remind = async () => {
    const text = reminderText(person.name, balanceMinor, firstOpen, currency);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setShared('Shared.');
      } else {
        await navigator.clipboard.writeText(text);
        setShared('Copied. Paste it into WhatsApp or a message.');
      }
    } catch {
      setShared(null); // cancelled
    }
  };

  return (
    <li className="person-row" data-testid="person-row">
      <button
        type="button"
        className="account-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="money-main">
          <span>{person.name}</span>
          <span className="muted small">
            {balanceMinor > 0 ? 'Owes you' : balanceMinor < 0 ? 'You owe' : 'Settled'}
            {summary.lastDate ? ` · last ${fmtDate(summary.lastDate)}` : ''}
          </span>
        </span>
        {balanceMinor !== 0 && (
          <Money
            minor={Math.abs(balanceMinor)}
            currency={currency}
            className={balanceMinor > 0 ? 'money-in' : 'status-over'}
          />
        )}
      </button>
      {open && (
        <div className="account-panel">
          {!settling && (
            <div className="btn-row">
              {settle && (
                <button type="button" className="btn btn-primary" onClick={() => setSettling(true)}>
                  Settle up
                </button>
              )}
              {balanceMinor > 0 && (
                <button
                  type="button"
                  className="btn"
                  disabled={masked}
                  title={masked ? 'Turn off privacy mode to share an amount' : undefined}
                  onClick={() => void remind()}
                >
                  Remind
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void deletePerson(person.id)}
              >
                Remove {person.name}
              </button>
            </div>
          )}
          {masked && balanceMinor > 0 && (
            <p className="muted small">
              Reminders show the amount, so they are off in privacy mode.
            </p>
          )}
          {shared && (
            <p className="muted small" role="status">
              {shared}
            </p>
          )}
          {settling && settle && (
            <UdhaarForm
              personName={person.name}
              kind={settle}
              amountMinor={Math.abs(balanceMinor)}
              onDone={() => setSettling(false)}
            />
          )}
          <ul className="money-list" aria-label={`Entries with ${person.name}`}>
            {entries.map((e) => (
              <li key={e.id} className="money-row">
                <span className="money-main">
                  <span>{UDHAAR_LABEL[e.kind]}</span>
                  <span className="muted small">
                    {fmtDate(e.date)}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                </span>
                <Money minor={e.amountMinor} currency={currency} />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Delete ${UDHAAR_LABEL[e.kind].toLowerCase()} on ${fmtDate(e.date)}`}
                  onClick={() => void deleteUdhaar(e.id)}
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/** Udhaar: who owes you and whom you owe, settled in parts. Never spending or income. */
export function UdhaarView() {
  const people = useLedger((s) => s.people);
  const udhaar = useLedger((s) => s.udhaar);
  const currency = useLedger((s) => s.settings.currency);
  const [adding, setAdding] = useState(false);
  const summary = udhaarSummary(people, udhaar);
  const totals = udhaarTotals(summary);

  return (
    <section className="card" aria-labelledby="udhaar-title">
      <div className="card-head">
        <h2 id="udhaar-title">Udhaar</h2>
        {!adding && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add entry
          </button>
        )}
      </div>
      <dl className="cashflow-figures">
        <div>
          <dt>Owed to you</dt>
          <dd data-testid="owed-to-you">
            <Money minor={totals.owedToYouMinor} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>You owe</dt>
          <dd data-testid="you-owe">
            <Money minor={totals.youOweMinor} currency={currency} />
          </dd>
        </div>
      </dl>
      {adding && <UdhaarForm onDone={() => setAdding(false)} />}
      {summary.length === 0 ? (
        <p className="muted small">
          Lent someone money, or borrowed some? Add it here and settle it in parts. It never counts
          as spending.
        </p>
      ) : (
        <ul className="account-list" aria-label="People">
          {summary.map((s) => (
            <PersonRow key={s.person.id} summary={s} />
          ))}
        </ul>
      )}
    </section>
  );
}
