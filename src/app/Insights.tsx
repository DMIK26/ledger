import { useMemo, useState } from 'react';
import { useLedger } from '../data/store';
import { categoryById } from '../domain/categories';
import { fmtDate, todayISO } from '../domain/dates';
import { buildInsights, type Insight } from '../domain/insights';
import { Money } from './Money';
import { href } from './router';
import { useScopedTransactions } from '../kit/view';

function Text({ insight, currency }: { insight: Insight; currency: string }) {
  const categories = useLedger((s) => s.categories);
  const name = (id: string) => categoryById(categories, id)?.name ?? 'Other';
  switch (insight.kind) {
    case 'pace-over':
      return (
        <>
          At this pace the month ends at{' '}
          <Money minor={insight.projectedMinor} currency={currency} />, over budget by{' '}
          <Money minor={insight.overMinor} currency={currency} />.
        </>
      );
    case 'pace-under':
      return (
        <>
          On track: at this pace you finish with{' '}
          <Money minor={insight.leftMinor} currency={currency} /> of the budget left.
        </>
      );
    case 'category-up':
      return (
        <>
          {name(insight.categoryId)} is up <Money minor={insight.deltaMinor} currency={currency} />{' '}
          ({insight.pct}%) on this point last month.
        </>
      );
    case 'category-down':
      return (
        <>
          {name(insight.categoryId)} is down{' '}
          <Money minor={insight.deltaMinor} currency={currency} /> ({insight.pct}%) on this point
          last month.
        </>
      );
    case 'largest':
      return (
        <>
          Biggest expense this month: {insight.tx.merchant},{' '}
          <Money minor={insight.tx.amountMinor} currency={currency} /> on {fmtDate(insight.tx.date)}
          .
        </>
      );
    case 'upcoming':
      return (
        <>
          {insight.count === 1
            ? `${insight.merchant} is due ${fmtDate(insight.date)}`
            : `${insight.count} recurring payments are due this week, starting with ${insight.merchant} on ${fmtDate(insight.date)}`}
          : <Money minor={insight.totalMinor} currency={currency} />.{' '}
          <a href={href('/recurring')}>See recurring</a>
        </>
      );
    case 'quiet-days':
      return <>{insight.days} days this month with nothing spent.</>;
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
      <h2 id="insights-title">Worth knowing</h2>
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
