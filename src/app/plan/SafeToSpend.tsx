import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { safeToSpend } from '../../domain/plan';
import { Money } from '../Money';
import { href } from '../router';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

/**
 * Safe to spend today (Drop 10): the month's plan shared over the days left, after bills and goals.
 * Underspending one day raises the next days' amount by itself; overspending lowers it.
 */
export function SafeToSpendCard({ today, inline = false }: { today: string; inline?: boolean }) {
  // Inline, it is one row of the month card on the Dashboard rather than a card of its own.
  const Box = inline ? 'div' : 'section';
  const H = inline ? 'h3' : 'h2';
  const box = inline ? 'hero-safe' : 'card safe-card';
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
      <Box className={box} role={inline ? 'group' : undefined} aria-labelledby="safe-title">
        <H id="safe-title">{tl('Safe to spend today')}</H>
        <p className="muted small" data-testid="safe-start">
          {tr(
            '{0}, or log money in (type “salary 40k” above), and Ledger works out what you can spend each day and still end the month on plan.',
            <a href={href('/budgets')}>{tl('Set a monthly budget')}</a>,
          )}
        </p>
      </Box>
    );
  }

  // In the month card the budget line already says by how much the month is over, so say ₹0 here.
  const over = s.todayLeftMinor < 0 && !(inline && s.availableMinor <= 0);
  return (
    <Box className={box} role={inline ? 'group' : undefined} aria-labelledby="safe-title">
      <div className="card-head">
        <H id="safe-title">{tl('Safe to spend today')}</H>
        <span className="muted small">
          {s.daysLeft === 1 ? tl('Last day of the month') : tl('{0} days left', s.daysLeft)}
        </span>
      </div>
      <p className={inline ? 'hero-safe-figure' : 'big-figure'} data-testid="safe-today">
        {over ? (
          <span className="status-over">
            {tr('Over by {0}', <Money minor={-s.todayLeftMinor} currency={currency} />)}
          </span>
        ) : (
          <Money minor={Math.max(0, s.todayLeftMinor)} currency={currency} />
        )}
      </p>
      <p className="muted small" data-testid="safe-line">
        {s.availableMinor <= 0 ? (
          <>
            {tl(
              'Spending, bills and goals already use this month’s {0}, so nothing more is safe to spend.',
              s.source === 'budget' ? tl('budget') : tl('money in'),
            )}
          </>
        ) : over ? (
          <>
            {tr(
              '{0} spent today against {1} a day. The days after share less to make up for it.',
              <Money minor={s.spentTodayMinor} currency={currency} />,
              <Money minor={s.perDayMinor} currency={currency} />,
            )}
          </>
        ) : (
          <>
            {tr(
              '{0} a day{1}. Spend less today and the coming days get more.',
              <Money minor={s.perDayMinor} currency={currency} />,
              s.spentTodayMinor > 0 ? (
                <>
                  {tr(', {0} spent today', <Money minor={s.spentTodayMinor} currency={currency} />)}
                </>
              ) : null,
            )}
          </>
        )}
      </p>
      <details className="safe-math">
        <summary>{tl('How it is worked out')}</summary>
        <dl>
          <div>
            <dt>{s.source === 'budget' ? tl('Budget this month') : tl('Money in this month')}</dt>
            <dd>
              <Money minor={s.baseMinor} currency={currency} />
            </dd>
          </div>
          <div>
            <dt>{tl('Spent before today')}</dt>
            <dd>
              <Money minor={-s.spentBeforeMinor} currency={currency} signed />
            </dd>
          </div>
          <div>
            <dt>{tl('Bills still to come')}</dt>
            <dd>
              <Money minor={-s.billsMinor} currency={currency} signed />
            </dd>
          </div>
          <div>
            <dt>{tl('Goals this month')}</dt>
            <dd>
              <Money minor={-s.goalsMinor} currency={currency} signed />
            </dd>
          </div>
          <div className="safe-total">
            <dt>
              {tl(
                'Left for {0}',
                s.daysLeft === 1 ? tl('today') : tl('{0} days, today included', s.daysLeft),
              )}
            </dt>
            <dd>
              <Money minor={s.availableMinor} currency={currency} />
            </dd>
          </div>
        </dl>
      </details>
    </Box>
  );
}
