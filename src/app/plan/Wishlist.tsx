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
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

function WishForm({ onDone }: { onDone: () => void }) {
  const saveWish = useLedger((s) => s.saveWish);
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [wait, setWait] = useState<WaitDays>(7);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(tl('What do you want to buy?'));
    if (price === null || price <= 0) return setError(tl('Enter its price'));
    await saveWish({ name, priceMinor: price, waitDays: wait, note });
    onDone();
  };
  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="wish-name">{tl('What')}</label>
          <input
            id="wish-name"
            className="input"
            autoComplete="off"
            maxLength={MAX_WISH_NAME}
            placeholder={tl('Headphones')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wish-price">{tl('Price')}</label>
          <AmountInput id="wish-price" initialMinor={null} onChange={setPrice} />
        </div>
        <div className="field">
          <label htmlFor="wish-wait">{tl('Wait')}</label>
          <select
            id="wish-wait"
            className="input"
            value={wait}
            onChange={(e) => setWait(Number(e.target.value) as WaitDays)}
          >
            {WAIT_DAYS.map((d) => (
              <option key={d} value={d}>
                {tl('{0} days', d)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="wish-note">{tl('Note (optional)')}</label>
          <input
            id="wish-note"
            className="input"
            autoComplete="off"
            placeholder={tl('Why you want it')}
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
          {tl('Add to wishlist')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {tl('Cancel')}
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
            ? tl('Wait over since {0}', fmtDate(readyOn(item)))
            : tl(
                '{0} to wait, until {1}',
                left === 1 ? tl('1 more day') : tl('{0} more days', left),
                fmtDate(readyOn(item)),
              )}
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
              title={tl(
                'Logs it as {0} today, paid by {1}',
                category?.name ?? tl('an expense'),
                lastMethod,
              )}
            >
              {tl('Buy')}
            </button>
            <button type="button" className="btn" onClick={() => void skipWish(item.id)}>
              {tl('Skip')}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => void skipWish(item.id)}>
            {tl('Changed my mind')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={tl('Remove {0}', item.name)}
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
          <h2 id="wish-title">{tl('Wishlist')}</h2>
          {!adding && (
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              <Icon name="plus" />
              {tl('Add to wishlist')}
            </button>
          )}
        </div>
        <p className="small" data-testid="saved-by-waiting">
          {tr(
            'Saved by waiting: {0}{1}',
            <Money minor={s.savedByWaitingMinor} currency={currency} />,
            s.skippedCount > 0
              ? ' ' +
                  tl(
                    'from {0} you skipped.',
                    s.skippedCount === 1 ? tl('1 thing') : tl('{0} things', s.skippedCount),
                  )
              : '.',
          )}
        </p>
        {adding && <WishForm onDone={() => setAdding(false)} />}
        {s.waiting.length === 0 && !adding && (
          <p className="muted small">
            {tl(
              'Want something that is not urgent? Put it here with a 7 or 30 day wait. When the wait is over, buy it (Ledger logs the expense) or skip it and count what you kept.',
            )}
          </p>
        )}
        {s.waiting.length > 0 && (
          <>
            <p className="muted small">
              {tr(
                '{0} waiting, {1} in all{2}.',
                s.waiting.length === 1 ? tl('1 thing') : tl('{0} things', s.waiting.length),
                <Money minor={s.waitingMinor} currency={currency} />,
                s.readyCount > 0 ? tl('; {0} ready to decide', s.readyCount) : '',
              )}
            </p>
            <ul className="money-list" aria-label={tl('Waiting')}>
              {s.waiting.map((w) => (
                <WaitingRow key={w.id} item={w} today={today} />
              ))}
            </ul>
          </>
        )}
      </section>
      {s.decided.length > 0 && (
        <section className="card" aria-labelledby="decided-title">
          <h2 id="decided-title">{tl('Decided')}</h2>
          <ul className="money-list">
            {s.decided.map((w) => (
              <li key={w.id} className="money-row" data-testid="wish-decided">
                <span className="money-main">
                  <span>{w.name}</span>
                  <span className="muted small">
                    {w.status === 'bought' ? tl('Bought') : tl('Skipped')}
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
