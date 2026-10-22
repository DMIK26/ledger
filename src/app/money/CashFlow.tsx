import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { cashFlow, type CashFlow } from '../../domain/accounts';
import { lastMonths } from '../../domain/aggregates';
import { monthBounds, monthKey, monthLabel } from '../../domain/dates';
import { fmtMoney } from '../../domain/money';
import { useViewMonth } from '../../kit/view';
import { Money, usePrivacy } from '../Money';

/** In, out and left for the month on screen, then six months of in and out side by side. */
export function CashFlowCard({ today }: { today: string }) {
  const transactions = useLedger((s) => s.transactions);
  const flows = useLedger((s) => s.flows);
  const currency = useLedger((s) => s.settings.currency);
  usePrivacy();
  const month = useViewMonth();
  const end = monthBounds(month).end;
  const asOf = end < today ? end : today;
  const current = monthKey(today) === month;
  const now = useMemo(
    () => cashFlow(transactions, flows, month, asOf),
    [transactions, flows, month, asOf],
  );
  const series = useMemo(
    () =>
      lastMonths(asOf, 6).map((m) => {
        const e = monthBounds(m).end;
        return cashFlow(transactions, flows, m, e < asOf ? e : asOf);
      }),
    [transactions, flows, asOf],
  );
  const max = Math.max(1, ...series.flatMap((p) => [p.inMinor, p.outMinor]));
  const money = (m: number) => fmtMoney(m, { currency });
  const describe = (p: CashFlow) =>
    `${monthLabel(p.month)}: ${money(p.inMinor)} in, ${money(p.outMinor)} out`;

  return (
    <section className="card cashflow" aria-labelledby="cashflow-title">
      <div className="card-head">
        <h2 id="cashflow-title">Cash flow</h2>
        <span className="muted small">
          {monthLabel(month)}
          {current ? ' so far' : ''}
        </span>
      </div>
      <dl className="cashflow-figures">
        <div>
          <dt>In</dt>
          <dd data-testid="cashflow-in">
            <Money minor={now.inMinor} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>Out</dt>
          <dd data-testid="cashflow-out">
            <Money minor={now.outMinor} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>Left</dt>
          <dd data-testid="cashflow-left" className={now.leftMinor < 0 ? 'status-over' : undefined}>
            <Money minor={now.leftMinor} currency={currency} />
          </dd>
        </div>
      </dl>
      {now.feesMinor > 0 && (
        <p className="muted small">
          Out includes <Money minor={now.feesMinor} currency={currency} /> of interest and fees,
          which are not spending.
        </p>
      )}
      {now.inMinor === 0 && (
        <p className="muted small">
          No money in yet for {monthLabel(month)}. Add your salary below, or type “salary 40k” in
          quick add.
        </p>
      )}
      <ul className="cashflow-bars" aria-label="Six months of money in and out">
        {series.map((p) => (
          <li key={p.month} aria-label={describe(p)}>
            <span className="cashflow-month" aria-hidden="true">
              {monthLabel(p.month).slice(0, 3)}
            </span>
            <span className="cashflow-pair" aria-hidden="true">
              <span
                className="cashflow-bar cashflow-in"
                style={{ width: `${(p.inMinor / max) * 100}%` }}
              />
              <span
                className="cashflow-bar cashflow-out"
                style={{ width: `${(p.outMinor / max) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className="cashflow-key muted small" aria-hidden="true">
        <span className="cashflow-swatch cashflow-in" /> In{' '}
        <span className="cashflow-swatch cashflow-out" /> Out
      </p>
    </section>
  );
}
