import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { weekStart } from '../../domain/calendar';
import { categoryById } from '../../domain/categories';
import { addDays, diffDays, fmtDate } from '../../domain/dates';
import { buildRecap, type RecapPeriod } from '../../domain/recap';
import { occurrencesBetween } from '../../domain/recurring';
import { Money } from '../Money';

/**
 * The weekly digest (Drop 12, after Monarch's weekly recap): last week at a glance on the Dashboard,
 * Monday to Wednesday, with the bills due by Sunday. Shown once, like the recaps.
 */
export function WeekDigest({
  period,
  today,
  onOpen,
  onDone,
}: {
  period: RecapPeriod;
  today: string;
  onOpen: () => void;
  onDone: () => void;
}) {
  const transactions = useLedger((s) => s.transactions);
  const flows = useLedger((s) => s.flows);
  const recurring = useLedger((s) => s.recurring);
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const r = useMemo(
    () => buildRecap(period, transactions, flows, today),
    [period, transactions, flows, today],
  );
  const sunday = addDays(weekStart(today), 6);
  const bills = recurring
    .map((item) => ({ item, dates: occurrencesBetween(item, today, diffDays(sunday, today) + 1) }))
    .filter((b) => b.dates.length > 0);
  const billsMinor = bills.reduce((s, b) => s + b.item.amountMinor * b.dates.length, 0);
  const m = (minor: number) => <Money minor={minor} currency={currency} />;
  return (
    <section className="card recap-offer" aria-labelledby="digest-title" data-testid="week-digest">
      <h2 id="digest-title">
        Last week, {fmtDate(period.start)} to {fmtDate(period.end)}
      </h2>
      <ul className="digest">
        <li>
          Spent {m(r.totalMinor)}
          {r.changePct === null
            ? '.'
            : r.changePct === 0
              ? ', the same as the week before.'
              : `, ${Math.abs(r.changePct)}% ${r.changePct > 0 ? 'more' : 'less'} than the week before.`}
        </li>
        {r.topCategory && (
          <li>
            Most on {categoryById(categories, r.topCategory.categoryId)?.name ?? 'Other'}:{' '}
            {m(r.topCategory.totalMinor)}.
          </li>
        )}
        {r.biggest && (
          <li>
            Biggest: {r.biggest.merchant}, {m(r.biggest.amountMinor)} on {fmtDate(r.biggest.date)}.
          </li>
        )}
        <li>
          {r.quietDays === 0
            ? 'Something spent every day.'
            : r.quietDays === 1
              ? '1 day with nothing spent.'
              : `${r.quietDays} days with nothing spent.`}
        </li>
        <li>
          {bills.length === 0 ? (
            'No bills due the rest of this week.'
          ) : (
            <>
              {bills.length === 1
                ? `${bills[0]!.item.merchant} is due by Sunday`
                : `${bills.length} bills due by Sunday`}
              : {m(billsMinor)}.
            </>
          )}
        </li>
      </ul>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={onOpen}>
          Open the recap
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Got it
        </button>
      </div>
    </section>
  );
}
