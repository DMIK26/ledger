import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { categoryById } from '../../domain/categories';
import { categoriesAtRisk, type CategoryRisk } from '../../domain/plan';
import { Money } from '../Money';
import { href } from '../router';

export function useRisks(today: string): CategoryRisk[] {
  const transactions = useLedger((s) => s.transactions);
  const budgets = useLedger((s) => s.budgets);
  const categories = useLedger((s) => s.categories);
  const recurring = useLedger((s) => s.recurring);
  return useMemo(
    () => categoriesAtRisk({ transactions, budgets, categories, recurring, today }),
    [transactions, budgets, categories, recurring, today],
  );
}

/** One line about a category over its budget or heading over it. */
export function RiskText({ risk, currency }: { risk: CategoryRisk; currency: string }) {
  return risk.kind === 'over' ? (
    <span className="status-over">
      Over by <Money minor={risk.spentMinor - risk.budgetMinor} currency={currency} />
    </span>
  ) : (
    <span className="status-near">
      Heading for <Money minor={risk.forecastMinor} currency={currency} /> of{' '}
      <Money minor={risk.budgetMinor} currency={currency} />
    </span>
  );
}

/** Dashboard: categories over budget or heading over it at this rate. Nothing when all is well. */
export function AtRiskCard({ today }: { today: string }) {
  const risks = useRisks(today);
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  if (risks.length === 0) return null;
  return (
    <section className="card" aria-labelledby="risk-title" data-testid="at-risk">
      <div className="card-head">
        <h2 id="risk-title">Budgets to watch</h2>
        <a className="small" href={href('/budgets')}>
          Budgets
        </a>
      </div>
      <ul className="money-list">
        {risks.slice(0, 4).map((r) => (
          <li key={r.categoryId} className="money-row risk-row">
            <span className="money-main">
              <span>{categoryById(categories, r.categoryId)?.name ?? 'Other'}</span>
            </span>
            <span className="small">
              <RiskText risk={r} currency={currency} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
