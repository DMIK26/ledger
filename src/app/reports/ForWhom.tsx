import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { spentFor } from '../../domain/forWhom';
import type { Transaction } from '../../domain/types';
import { Money } from '../Money';

/** Spent for whom (Drop 12): the period's spending per person it was for; shown once anyone is named. */
export function ForWhom({
  transactions,
  start,
  end,
}: {
  transactions: readonly Transaction[];
  start: string;
  end: string;
}) {
  const currency = useLedger((s) => s.settings.currency);
  const rows = useMemo(() => spentFor(transactions, start, end), [transactions, start, end]);
  if (!rows.some((r) => r.name)) return null;
  const max = Math.max(1, ...rows.map((r) => r.totalMinor));
  return (
    <section className="card" aria-labelledby="for-whom-title" data-testid="for-whom">
      <h2 id="for-whom-title">Spent for whom</h2>
      <ul className="hbars">
        {rows.map((r) => (
          <li key={r.name || 'you'} className="hbar">
            <span className="hbar-label">{r.name || 'You'}</span>
            <Money minor={r.totalMinor} currency={currency} />
            <span className="muted small hbar-note">
              {r.count === 1 ? '1 entry' : `${r.count} entries`}
            </span>
            <span className="hbar-track" aria-hidden="true">
              <span className="hbar-fill" style={{ width: `${(r.totalMinor / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
