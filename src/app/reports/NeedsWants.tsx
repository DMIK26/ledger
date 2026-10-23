import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { fiftyThirtyTwenty, needOf, TARGETS } from '../../domain/needs';
import type { Transaction } from '../../domain/types';
import { Money } from '../Money';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

/**
 * 50/30/20 for the report's period (Drop 12): needs, wants and what was left of the money in, against
 * 50%, 30% and 20%. Which categories are needs can be changed here.
 */
export function NeedsWants({
  transactions,
  start,
  end,
}: {
  transactions: readonly Transaction[];
  start: string;
  end: string;
}) {
  const flows = useLedger((s) => s.flows);
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const setCategoryNeed = useLedger((s) => s.setCategoryNeed);
  const r = useMemo(
    () => fiftyThirtyTwenty({ transactions, flows, categories, start, end }),
    [transactions, flows, categories, start, end],
  );
  const rows =
    r.base === 'income'
      ? [
          {
            key: 'needs',
            label: tl('Needs'),
            minor: r.needsMinor,
            pct: r.pct.needs,
            aim: TARGETS.needs,
          },
          {
            key: 'wants',
            label: tl('Wants'),
            minor: r.wantsMinor,
            pct: r.pct.wants,
            aim: TARGETS.wants,
          },
          {
            key: 'left',
            label: tl('Left over'),
            minor: r.leftMinor ?? 0,
            pct: r.pct.left ?? 0,
            aim: TARGETS.left,
          },
        ]
      : [
          { key: 'needs', label: tl('Needs'), minor: r.needsMinor, pct: r.pct.needs, aim: null },
          { key: 'wants', label: tl('Wants'), minor: r.wantsMinor, pct: r.pct.wants, aim: null },
        ];
  return (
    <section className="card" aria-labelledby="nww-title" data-testid="fifty-thirty-twenty">
      <div className="card-head">
        <h2 id="nww-title">{tl('Needs, wants and saving')}</h2>
        <span className="muted small">50/30/20</span>
      </div>
      <p className="small">
        {r.base === 'income' ? (
          <>
            {tr(
              'Of {0} that came in. The usual aim is half on needs, under a third on wants and a fifth kept.',
              <Money minor={r.inMinor} currency={currency} />,
            )}
          </>
        ) : (
          tl(
            'No money in for this period, so this is just how spending split. Add money in on the Money page to see what was kept.',
          )
        )}
      </p>
      <div className="split-bar" aria-hidden="true">
        {rows
          .filter((x) => x.pct > 0)
          .map((x) => (
            <span key={x.key} className={`split-${x.key}`} style={{ width: `${x.pct}%` }} />
          ))}
      </div>
      <ul className="hbars">
        {rows.map((x) => (
          <li key={x.key} className="hbar" data-testid={`nww-${x.key}`}>
            <span className="hbar-label">
              <span className={`dot split-${x.key}`} />
              {x.label}
            </span>
            {x.minor < 0 ? (
              <span className="status-over">
                {tr('Over by {0}', <Money minor={-x.minor} currency={currency} />)}
              </span>
            ) : (
              <Money minor={x.minor} currency={currency} />
            )}
            <span className="muted small hbar-note">
              {x.pct}%{x.aim !== null ? tl(', aim {0}%', x.aim) : ''}
            </span>
          </li>
        ))}
      </ul>
      <details>
        <summary>{tl('Which categories are needs')}</summary>
        <ul className="need-list">
          {categories.map((c) => {
            const kind = needOf(c);
            return (
              <li key={c.id} className="need-row">
                <span>{c.name}</span>
                <span className="segmented" role="group" aria-label={tl('{0} is a', c.name)}>
                  <button
                    type="button"
                    aria-pressed={kind === 'need'}
                    onClick={() => kind !== 'need' && void setCategoryNeed(c.id, 'need')}
                  >
                    {tl('Need')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={kind === 'want'}
                    onClick={() => kind !== 'want' && void setCategoryNeed(c.id, 'want')}
                  >
                    {tl('Want')}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
