import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { weekStart } from '../../domain/calendar';
import { categoryById } from '../../domain/categories';
import { addDays, diffDays, fmtDate } from '../../domain/dates';
import { buildRecap, type RecapPeriod } from '../../domain/recap';
import { occurrencesBetween } from '../../domain/recurring';
import { Money } from '../Money';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

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
        {tl('Last week, {0} to {1}', fmtDate(period.start), fmtDate(period.end))}
      </h2>
      <ul className="digest">
        <li>
          {tr(
            'Spent {0}{1}',
            m(r.totalMinor),
            r.changePct === null
              ? '.'
              : r.changePct === 0
                ? tl(', the same as the week before.')
                : tl(
                    ', {0}% {1} than the week before.',
                    Math.abs(r.changePct),
                    r.changePct > 0 ? tl('more') : tl('less'),
                  ),
          )}
        </li>
        {r.topCategory && (
          <li>
            {tr(
              'Most on {0}: {1}.',
              categoryById(categories, r.topCategory.categoryId)?.name ?? tl('Other'),
              m(r.topCategory.totalMinor),
            )}
          </li>
        )}
        {r.biggest && (
          <li>
            {tr(
              'Biggest: {0}, {1} on {2}.',
              r.biggest.merchant,
              m(r.biggest.amountMinor),
              fmtDate(r.biggest.date),
            )}
          </li>
        )}
        <li>
          {r.quietDays === 0
            ? tl('Something spent every day.')
            : r.quietDays === 1
              ? tl('1 day with nothing spent.')
              : tl('{0} days with nothing spent.', r.quietDays)}
        </li>
        <li>
          {bills.length === 0 ? (
            tl('No bills due the rest of this week.')
          ) : (
            <>
              {bills.length === 1
                ? tl('{0} is due by Sunday', bills[0]!.item.merchant)
                : tl('{0} bills due by Sunday', bills.length)}
              : {m(billsMinor)}.
            </>
          )}
        </li>
      </ul>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={onOpen}>
          {tl('Open the recap')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {tl('Got it')}
        </button>
      </div>
    </section>
  );
}
