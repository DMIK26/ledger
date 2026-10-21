import { EmptyDoodle } from '../../doodle/Studio';
import { useMemo, useState, type FormEvent } from 'react';
import { Timeline } from '../../charts/Timeline';
import { newId, useLedger } from '../../data/store';
import { categorise, normalizeMerchantKey } from '../../domain/categoriser';
import { categoryById } from '../../domain/categories';
import { fmtDate, parseISO, todayISO } from '../../domain/dates';
import {
  CADENCE_LABEL,
  detectRecurring,
  nextOccurrence,
  occurrence,
  yearlyCost,
  type Cadence,
  type Candidate,
} from '../../domain/recurring';
import { PAYMENT_METHODS, type PaymentMethod } from '../../domain/types';
import { AmountInput } from '../AmountInput';
import { usePins, useScopedTransactions } from '../../kit/view';
import { Money } from '../Money';

function AddForm({ onDone }: { onDone: () => void }) {
  const categories = useLedger((s) => s.categories);
  const rules = useLedger((s) => s.rules);
  const lastMethod = useLedger((s) => s.settings.lastMethod);
  const saveRecurring = useLedger((s) => s.saveRecurring);
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState('other');
  const [touched, setTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(lastMethod);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!merchant.trim()) return setError('Say what it is for');
    if (amount === null || amount <= 0) return setError('Enter an amount above zero');
    if (!parseISO(date)) return setError('Pick the next date it is due');
    await saveRecurring({
      id: newId(),
      merchant: merchant.trim(),
      categoryId,
      method,
      amountMinor: amount,
      cadence,
      anchor: date,
      createdAt: Date.now(),
    });
    onDone();
  };

  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="rec-merchant">What for</label>
          <input
            id="rec-merchant"
            className="input"
            autoComplete="off"
            value={merchant}
            onChange={(e) => {
              setMerchant(e.target.value);
              if (!touched) setCategoryId(categorise(e.target.value, rules).categoryId);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="rec-amount">Amount</label>
          <AmountInput id="rec-amount" initialMinor={null} onChange={setAmount} />
        </div>
        <div className="field">
          <label htmlFor="rec-cadence">How often</label>
          <select
            id="rec-cadence"
            className="select input"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as Cadence)}
          >
            {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rec-date">Next due</label>
          <input
            id="rec-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="rec-category">Category</label>
          <select
            id="rec-category"
            className="select input"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setTouched(true);
            }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rec-method">Paid by</label>
          <select
            id="rec-method"
            className="select input"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary">
          Add
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function Recurring() {
  const transactions = useScopedTransactions();
  const categories = useLedger((s) => s.categories);
  const allRecurring = useLedger((s) => s.recurring);
  const pins = usePins();
  // Category and merchant pins narrow the list; other pins do not apply to plans.
  const recurring = allRecurring.filter((r) =>
    (['category', 'merchant'] as const).every((kind) => {
      const ofKind = pins.filter((p) => p.kind === kind);
      if (ofKind.length === 0) return true;
      const id = kind === 'category' ? r.categoryId : normalizeMerchantKey(r.merchant);
      return ofKind.some((p) => p.id === id);
    }),
  );
  const ignored = useLedger((s) => s.recurringIgnored);
  const currency = useLedger((s) => s.settings.currency);
  const saveRecurring = useLedger((s) => s.saveRecurring);
  const deleteRecurring = useLedger((s) => s.deleteRecurring);
  const shiftRecurring = useLedger((s) => s.shiftRecurring);
  const ignoreRecurring = useLedger((s) => s.ignoreRecurring);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const today = todayISO();

  const known = useMemo(
    () => new Set([...ignored, ...allRecurring.map((r) => normalizeMerchantKey(r.merchant))]),
    [ignored, allRecurring],
  );
  const candidates = useMemo(
    () => detectRecurring(transactions, today, known),
    [transactions, today, known],
  );

  const yearly = recurring.reduce((s, r) => s + yearlyCost(r), 0);
  const saving = recurring.filter((r) => off.has(r.id)).reduce((s, r) => s + yearlyCost(r), 0);

  const accept = (c: Candidate) =>
    saveRecurring({
      id: newId(),
      merchant: c.merchant,
      categoryId: c.categoryId,
      method: c.method,
      amountMinor: c.amountMinor,
      cadence: c.cadence,
      anchor: occurrence(c.lastDate, c.cadence, 1),
      createdAt: 0, // the store stamps it
    });

  return (
    <>
      <section className="card" aria-labelledby="timeline-title">
        <div className="card-head">
          <h2 id="timeline-title">Next 30 days</h2>
          {!adding && (
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              Add recurring payment
            </button>
          )}
        </div>
        {adding && <AddForm onDone={() => setAdding(false)} />}
        {recurring.length === 0 ? (
          <div className="empty-inline">
            <EmptyDoodle art="calendar" />
            <p className="muted">
              No recurring payments yet. Add one, or accept one Ledger found in your entries below.
            </p>
          </div>
        ) : (
          <>
            <p className="muted small">
              Drag a payment sideways, or focus it and use the arrow keys, to move its dates.
            </p>
            <Timeline
              items={recurring}
              categories={categories}
              currency={currency}
              today={today}
              off={off}
              onShift={(id, days) => void shiftRecurring(id, days)}
            />
          </>
        )}
      </section>

      {recurring.length > 0 && (
        <section className="card" aria-labelledby="rec-list-title">
          <div className="card-head">
            <h2 id="rec-list-title">Your recurring payments</h2>
            <span className="small">
              <Money minor={yearly} currency={currency} /> a year
            </span>
          </div>
          <ul className="rec-list">
            {recurring.map((r) => {
              const c = categoryById(categories, r.categoryId);
              const isOff = off.has(r.id);
              return (
                <li key={r.id} className="rec-row" data-testid={`rec-${r.id}`}>
                  <span className="rec-name">
                    <span className="dot" style={{ background: c?.color ?? 'var(--faint)' }} />
                    <span>
                      {r.merchant}
                      <span className="muted small rec-sub">
                        {CADENCE_LABEL[r.cadence]}, next {fmtDate(nextOccurrence(r, today))}
                      </span>
                    </span>
                  </span>
                  <span className="rec-amount">
                    <Money minor={r.amountMinor} currency={currency} />
                    <span className="muted small rec-sub">
                      <Money minor={yearlyCost(r)} currency={currency} /> a year
                    </span>
                  </span>
                  <span className="rec-actions">
                    <label className="rec-switch">
                      <button
                        type="button"
                        role="switch"
                        className="switch"
                        aria-checked={isOff}
                        aria-label={`What if I switched off ${r.merchant}`}
                        onClick={() =>
                          setOff((s) => {
                            const next = new Set(s);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          })
                        }
                      />
                      <span className="small">Switch off</span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void deleteRecurring(r.id)}
                    >
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="what-if-saving" role="status" data-testid="rec-saving">
            {off.size === 0 ? (
              <span className="muted small">
                Use Switch off to see what cancelling a payment would save. Nothing is changed.
              </span>
            ) : (
              <>
                Switching off {off.size === 1 ? 'this' : `these ${off.size}`} saves{' '}
                <Money minor={saving} currency={currency} /> a year, about{' '}
                <Money minor={Math.round(saving / 12)} currency={currency} /> a month.
              </>
            )}
          </p>
        </section>
      )}

      <section className="card" aria-labelledby="found-title">
        <h2 id="found-title">Found in your entries</h2>
        {candidates.length === 0 ? (
          <p className="muted small">
            Nothing yet. Ledger looks for the same merchant at a steady weekly, monthly or yearly
            gap with a similar amount, three times or more.
          </p>
        ) : (
          <ul className="rec-list">
            {candidates.map((c) => (
              <li key={c.key} className="rec-row" data-testid={`candidate-${c.key}`}>
                <span className="rec-name">
                  <span
                    className="dot"
                    style={{ background: categoryById(categories, c.categoryId)?.color }}
                  />
                  <span>
                    {c.merchant}
                    <span className="muted small rec-sub">
                      {CADENCE_LABEL[c.cadence]}, seen {c.count} times, last {fmtDate(c.lastDate)}
                    </span>
                  </span>
                </span>
                <span className="rec-amount">
                  <Money minor={c.amountMinor} currency={currency} />
                </span>
                <span className="rec-actions">
                  <button type="button" className="btn" onClick={() => void accept(c)}>
                    Add
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void ignoreRecurring(c.key)}
                  >
                    Not recurring
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
