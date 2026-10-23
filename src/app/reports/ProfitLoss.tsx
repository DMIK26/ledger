import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { categoryById } from '../../domain/categories';
import { safeText, toCsv } from '../../domain/csv';
import { monthLabel } from '../../domain/dates';
import { minorToPlain } from '../../domain/money';
import { profitAndLoss, spaceOf, type ProfitAndLoss } from '../../domain/spaces';
import type { Transaction } from '../../domain/types';
import { csvFile, ExportButton } from '../files';
import { Money } from '../Money';
import { tl } from '../../domain/i18n';

function Lines({ pl, currency }: { pl: ProfitAndLoss; currency: string }) {
  return (
    <dl className="facts">
      <div>
        <dt>{tl('Sales')}</dt>
        <dd>
          <Money minor={pl.salesMinor} currency={currency} />
        </dd>
      </div>
      <div>
        <dt>{tl('Spending')}</dt>
        <dd>
          <Money minor={pl.spentMinor} currency={currency} />
        </dd>
      </div>
      {pl.feesMinor > 0 && (
        <div>
          <dt>{tl('Fees and interest')}</dt>
          <dd>
            <Money minor={pl.feesMinor} currency={currency} />
          </dd>
        </div>
      )}
      <div>
        <dt>{pl.profitMinor >= 0 ? tl('Profit') : tl('Loss')}</dt>
        <dd data-testid="pl-profit" className={pl.profitMinor < 0 ? 'status-over' : undefined}>
          <Money minor={Math.abs(pl.profitMinor)} currency={currency} />
          {pl.marginPct !== null && (
            <span className="muted small"> {tl('{0}% of sales', pl.marginPct)}</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Profit and loss (Drop 13): the shop's sales less its spending and fees for the report's period, with
 * a row per month for longer periods. In Both, Personal and the shop side by side.
 */
export function ProfitLoss({
  transactions,
  start,
  end,
  label,
}: {
  transactions: readonly Transaction[];
  start: string;
  end: string;
  label: string;
}) {
  const on = useLedger((s) => s.settings.spacesOn);
  const space = useLedger((s) => s.settings.space);
  const shopName = tl(useLedger((s) => s.settings.shopName) || 'Shop');
  const flows = useLedger((s) => s.flows);
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const shop = useMemo(
    () =>
      profitAndLoss({
        transactions: transactions.filter((t) => spaceOf(t) === 'shop'),
        flows: flows.filter((f) => spaceOf(f) === 'shop'),
        start,
        end,
      }),
    [transactions, flows, start, end],
  );
  const personal = useMemo(
    () =>
      profitAndLoss({
        transactions: transactions.filter((t) => spaceOf(t) === 'personal'),
        flows: flows.filter((f) => spaceOf(f) === 'personal'),
        start,
        end,
      }),
    [transactions, flows, start, end],
  );
  if (!on || space === 'personal') return null;
  const name = (id: string) => categoryById(categories, id)?.name ?? tl('Other');
  const csv = () => {
    const rows: string[][] = [['Line', 'Amount']];
    rows.push(['Sales', minorToPlain(shop.salesMinor)]);
    for (const c of shop.byCategory)
      rows.push([safeText(name(c.categoryId)), minorToPlain(c.totalMinor)]);
    rows.push(['Fees and interest', minorToPlain(shop.feesMinor)]);
    rows.push(['Profit', minorToPlain(shop.profitMinor)]);
    if (shop.months.length > 0) {
      rows.push([]);
      rows.push(['Month', 'Sales', 'Spending', 'Fees', 'Profit']);
      for (const m of shop.months)
        rows.push([
          m.month,
          minorToPlain(m.salesMinor),
          minorToPlain(m.spentMinor),
          minorToPlain(m.feesMinor),
          minorToPlain(m.profitMinor),
        ]);
    }
    return csvFile(`ledger-profit-and-loss-${start}-to-${end}.csv`, toCsv(rows));
  };
  return (
    <section className="card" aria-labelledby="pl-title" data-testid="profit-loss">
      <div className="card-head">
        <h2 id="pl-title">{tl('{0}: profit and loss, {1}', shopName, label)}</h2>
        <ExportButton label={tl('Export CSV')} className="btn btn-ghost" build={csv} />
      </div>
      <Lines pl={shop} currency={currency} />
      {shop.byCategory.length > 0 && (
        <ul className="hbars">
          {shop.byCategory.map((c) => (
            <li key={c.categoryId} className="hbar">
              <span className="hbar-label">{name(c.categoryId)}</span>
              <Money minor={c.totalMinor} currency={currency} />
            </li>
          ))}
        </ul>
      )}
      {shop.months.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="pl-title">
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">{tl('Month')}</th>
                <th scope="col" className="num">
                  {tl('Sales')}
                </th>
                <th scope="col" className="num">
                  {tl('Spending')}
                </th>
                <th scope="col" className="num">
                  {tl('Profit')}
                </th>
              </tr>
            </thead>
            <tbody>
              {shop.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{monthLabel(m.month)}</th>
                  <td className="num">
                    <Money minor={m.salesMinor} currency={currency} />
                  </td>
                  <td className="num">
                    <Money minor={m.spentMinor + m.feesMinor} currency={currency} />
                  </td>
                  <td className="num">
                    <Money minor={m.profitMinor} currency={currency} signed />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {space === 'both' && (
        <>
          <h3 className="small">{tl('Personal, the same period')}</h3>
          <dl className="facts">
            <div>
              <dt>{tl('Money in')}</dt>
              <dd>
                <Money minor={personal.salesMinor} currency={currency} />
              </dd>
            </div>
            <div>
              <dt>{tl('Spending')}</dt>
              <dd>
                <Money minor={personal.spentMinor + personal.feesMinor} currency={currency} />
              </dd>
            </div>
            <div>
              <dt>{tl('Left')}</dt>
              <dd data-testid="pl-personal-left">
                <Money minor={personal.profitMinor} currency={currency} signed />
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
