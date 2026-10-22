import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { safeToSpend } from '../../domain/plan';
import { Money } from '../Money';
import { href } from '../router';

/**
 * Safe to spend today (Drop 10): the month's plan shared over the days left, after bills and goals.
 * Underspending one day raises the next days' amount by itself; overspending lowers it.
 */
export function SafeToSpendCard({ today }: { today: string }) {
  const transactions = useLedger((s) => s.transactions);
  const flows = useLedger((s) => s.flows);
  const budgets = useLedger((s) => s.budgets);
  const categories = useLedger((s) => s.categories);
  const recurring = useLedger((s) => s.recurring);
  const goals = useLedger((s) => s.goals);
  const currency = useLedger((s) => s.settings.currency);
  const s = useMemo(
    () => safeToSpend({ transactions, flows, budgets, categories, recurring, goals, today }),
    [transactions, flows, budgets, categories, recurring, goals, today],
  );

  if (s.source === 'none') {
    return (
      <section className="card safe-card" aria-labelledby="safe-title">
        <h2 id="safe-title">Safe to spend today</h2>
        <p className="muted small" data-testid="safe-start">
          <a href={href('/budgets')}>Set a monthly budget</a>, or log money in (type “salary 40k”
          above), and Ledger works out what you can spend each day and still end the month on plan.
        </p>
      </section>
    );
  }

  const over = s.todayLeftMinor < 0;
  return (
    <section className="card safe-card" aria-labelledby="safe-title">
      <div className="card-head">
        <h2 id="safe-title">Safe to spend today</h2>
        <span className="muted small">
          {s.daysLeft === 1 ? 'Last day of the month' : `${s.daysLeft} days left`}
        </span>
      </div>
      <p className="big-figure" data-testid="safe-today">
        {over ? (
          <span className="status-over">
            Over by <Money minor={-s.todayLeftMinor} currency={currency} />
          </span>
        ) : (
          <Money minor={s.todayLeftMinor} currency={currency} />
        )}
      </p>
      <p className="muted small" data-testid="safe-line">
        {s.availableMinor <= 0 ? (
          <>
            Spending, bills and goals already use this month&rsquo;s{' '}
            {s.source === 'budget' ? 'budget' : 'money in'}, so nothing more is safe to spend.
          </>
        ) : over ? (
          <>
            <Money minor={s.spentTodayMinor} currency={currency} /> spent today against{' '}
            <Money minor={s.perDayMinor} currency={currency} /> a day. The days after share less to
            make up for it.
          </>
        ) : (
          <>
            <Money minor={s.perDayMinor} currency={currency} /> a day
            {s.spentTodayMinor > 0 ? (
              <>
                , <Money minor={s.spentTodayMinor} currency={currency} /> spent today
              </>
            ) : null}
            . Spend less today and the coming days get more.
          </>
        )}
      </p>
      <details className="safe-math">
        <summary>How it is worked out</summary>
        <dl>
          <div>
            <dt>{s.source === 'budget' ? 'Budget this month' : 'Money in this month'}</dt>
            <dd>
              <Money minor={s.baseMinor} currency={currency} />
            </dd>
          </div>
          <div>
            <dt>Spent before today</dt>
            <dd>
              <Money minor={-s.spentBeforeMinor} currency={currency} signed />
            </dd>
          </div>
          <div>
            <dt>Bills still to come</dt>
            <dd>
              <Money minor={-s.billsMinor} currency={currency} signed />
            </dd>
          </div>
          <div>
            <dt>Goals this month</dt>
            <dd>
              <Money minor={-s.goalsMinor} currency={currency} signed />
            </dd>
          </div>
          <div className="safe-total">
            <dt>Left for {s.daysLeft === 1 ? 'today' : `${s.daysLeft} days, today included`}</dt>
            <dd>
              <Money minor={s.availableMinor} currency={currency} />
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
