import { useMemo, useState } from 'react';
import { useLedger } from '../data/store';
import { categoryById } from '../domain/categories';
import { fmtDate, todayISO } from '../domain/dates';
import { buildInsights, type Insight } from '../domain/insights';
import { Money } from './Money';
import { href } from './router';
import { useScopedTransactions } from '../kit/view';
import { tl } from '../domain/i18n';
import { tr } from './tr';

function Text({ insight, currency }: { insight: Insight; currency: string }) {
  const categories = useLedger((s) => s.categories);
  const name = (id: string) => categoryById(categories, id)?.name ?? tl('Other');
  switch (insight.kind) {
    case 'pace-over':
      return (
        <>
          {tr(
            'At this pace the month ends at {0}, over budget by {1}.',
            <Money minor={insight.projectedMinor} currency={currency} />,
            <Money minor={insight.overMinor} currency={currency} />,
          )}
        </>
      );
    case 'pace-under':
      return (
        <>
          {tr(
            'On track: at this pace you finish with {0} of the budget left.',
            <Money minor={insight.leftMinor} currency={currency} />,
          )}
        </>
      );
    case 'category-up':
      return (
        <>
          {tr(
            '{0} is up {1} ({2}%) on this point last month.',
            name(insight.categoryId),
            <Money minor={insight.deltaMinor} currency={currency} />,
            insight.pct,
          )}
        </>
      );
    case 'category-down':
      return (
        <>
          {tr(
            '{0} is down {1} ({2}%) on this point last month.',
            name(insight.categoryId),
            <Money minor={insight.deltaMinor} currency={currency} />,
            insight.pct,
          )}
        </>
      );
    case 'largest':
      return (
        <>
          {tr(
            'Biggest expense this month: {0}, {1} on {2}.',
            insight.tx.merchant,
            <Money minor={insight.tx.amountMinor} currency={currency} />,
            fmtDate(insight.tx.date),
          )}
        </>
      );
    case 'upcoming':
      return (
        <>
          {insight.count === 1
            ? tl('{0} is due {1}', insight.merchant, fmtDate(insight.date))
            : tl(
                '{0} recurring payments are due this week, starting with {1} on {2}',
                insight.count,
                insight.merchant,
                fmtDate(insight.date),
              )}
          : <Money minor={insight.totalMinor} currency={currency} />.{' '}
          <a href={href('/recurring')}>{tl('See recurring')}</a>
        </>
      );
    case 'quiet-days':
      return <>{tl('{0} days this month with nothing spent.', insight.days)}</>;
  }
}

/** Up to four plain observations about the month, from data on this device only. */
export function Insights({ overallBudgetMinor }: { overallBudgetMinor: number | null }) {
  const transactions = useScopedTransactions();
  const recurring = useLedger((s) => s.recurring);
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const [today] = useState(todayISO);
  const insights = useMemo(
    () => buildInsights(transactions, today, overallBudgetMinor, recurring, categories),
    [transactions, today, overallBudgetMinor, recurring, categories],
  );
  if (insights.length === 0) return null;
  return (
    <section className="card" aria-labelledby="insights-title">
      <h2 id="insights-title">{tl('Worth knowing')}</h2>
      <ul className="insights" data-testid="insights">
        {insights.map((i) => (
          <li key={i.kind}>
            <Text insight={i} currency={currency} />
          </li>
        ))}
      </ul>
    </section>
  );
}
