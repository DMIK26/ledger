import { useState, type FormEvent } from 'react';
import { useLedger } from '../../data/store';
import { categorise } from '../../domain/categoriser';
import { categoryById } from '../../domain/categories';
import { fmtDate, todayISO } from '../../domain/dates';
import {
  daysToWait,
  isReady,
  MAX_WISH_NAME,
  readyOn,
  WAIT_DAYS,
  wishlistSummary,
  type WaitDays,
  type WishItem,
} from '../../domain/wishlist';
import { AmountInput } from '../AmountInput';
import { Icon } from '../icons';
import { Money } from '../Money';

function WishForm({ onDone }: { onDone: () => void }) {
  const saveWish = useLedger((s) => s.saveWish);
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [wait, setWait] = useState<WaitDays>(7);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('What do you want to buy?');
    if (price === null || price <= 0) return setError('Enter its price');
    await saveWish({ name, priceMinor: price, waitDays: wait, note });
    onDone();
  };
  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="wish-name">What</label>
          <input
            id="wish-name"
            className="input"
            autoComplete="off"
            maxLength={MAX_WISH_NAME}
            placeholder="Headphones"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wish-price">Price</label>
          <AmountInput id="wish-price" initialMinor={null} onChange={setPrice} />
        </div>
        <div className="field">
          <label htmlFor="wish-wait">Wait</label>
          <select
            id="wish-wait"
            className="input"
            value={wait}
            onChange={(e) => setWait(Number(e.target.value) as WaitDays)}
          >
            {WAIT_DAYS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="wish-note">Note (optional)</label>
          <input
            id="wish-note"
            className="input"
            autoComplete="off"
            placeholder="Why you want it"
            value={note}
            onChange={(e) => setNote(e.target.value)}
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
          Add to wishlist
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function WaitingRow({ item, today }: { item: WishItem; today: string }) {
  const currency = useLedger((s) => s.settings.currency);
  const rules = useLedger((s) => s.rules);
  const categories = useLedger((s) => s.categories);
  const lastMethod = useLedger((s) => s.settings.lastMethod);
  const buyWish = useLedger((s) => s.buyWish);
  const skipWish = useLedger((s) => s.skipWish);
  const deleteWish = useLedger((s) => s.deleteWish);
  const ready = isReady(item, today);
  const left = daysToWait(item, today);
  const category = categoryById(
    categories,
    item.categoryId ?? categorise(item.name, rules).categoryId,
  );
  return (
    <li className="wish-row" data-testid="wish-row">
      <div className="money-main">
        <span className="wish-name">{item.name}</span>
        <span className="muted small">
          {ready
            ? `Wait over since ${fmtDate(readyOn(item))}`
            : `${left === 1 ? '1 more day' : `${left} more days`} to wait, until ${fmtDate(readyOn(item))}`}
          {item.note ? ` · ${item.note}` : ''}
        </span>
      </div>
      <Money minor={item.priceMinor} currency={currency} />
      <div className="btn-row wish-actions">
        {ready ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void buyWish(item.id)}
              title={`Logs it as ${category?.name ?? 'an expense'} today, paid by ${lastMethod}`}
            >
              Buy
            </button>
            <button type="button" className="btn" onClick={() => void skipWish(item.id)}>
              Skip
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => void skipWish(item.id)}>
            Changed my mind
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={`Remove ${item.name}`}
          onClick={() => void deleteWish(item.id)}
        >
          <Icon name="close" />
        </button>
      </div>
    </li>
  );
}

/**
 * Budgets > Wishlist: a cooling-off list. Things wait 7 or 30 days before Buy (which logs the expense)
 * or Skip; what skipping saved adds up.
 */
export function WishlistView() {
  const wishlist = useLedger((s) => s.wishlist);
  const currency = useLedger((s) => s.settings.currency);
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  const s = wishlistSummary(wishlist, today);
  return (
    <>
      <section className="card" aria-labelledby="wish-title">
        <div className="card-head">
          <h2 id="wish-title">Wishlist</h2>
          {!adding && (
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              <Icon name="plus" />
              Add to wishlist
            </button>
          )}
        </div>
        <p className="small" data-testid="saved-by-waiting">
          Saved by waiting: <Money minor={s.savedByWaitingMinor} currency={currency} />
          {s.skippedCount > 0
            ? ` from ${s.skippedCount === 1 ? '1 thing' : `${s.skippedCount} things`} you skipped.`
            : '.'}
        </p>
        {adding && <WishForm onDone={() => setAdding(false)} />}
        {s.waiting.length === 0 && !adding && (
          <p className="muted small">
            Want something that is not urgent? Put it here with a 7 or 30 day wait. When the wait is
            over, buy it (Ledger logs the expense) or skip it and count what you kept.
          </p>
        )}
        {s.waiting.length > 0 && (
          <>
            <p className="muted small">
              {s.waiting.length === 1 ? '1 thing' : `${s.waiting.length} things`} waiting,{' '}
              <Money minor={s.waitingMinor} currency={currency} /> in all
              {s.readyCount > 0 ? `; ${s.readyCount} ready to decide` : ''}.
            </p>
            <ul className="money-list" aria-label="Waiting">
              {s.waiting.map((w) => (
                <WaitingRow key={w.id} item={w} today={today} />
              ))}
            </ul>
          </>
        )}
      </section>
      {s.decided.length > 0 && (
        <section className="card" aria-labelledby="decided-title">
          <h2 id="decided-title">Decided</h2>
          <ul className="money-list">
            {s.decided.map((w) => (
              <li key={w.id} className="money-row" data-testid="wish-decided">
                <span className="money-main">
                  <span>{w.name}</span>
                  <span className="muted small">
                    {w.status === 'bought' ? 'Bought' : 'Skipped'}
                    {w.decidedOn ? ` ${fmtDate(w.decidedOn)}` : ''}
                  </span>
                </span>
                <Money minor={w.priceMinor} currency={currency} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
