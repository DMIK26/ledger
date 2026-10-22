import { useLedger } from '../data/store';
import { categoryTotals } from '../domain/aggregates';
import { normalizeMerchantKey } from '../domain/categoriser';
import { categoryById } from '../domain/categories';
import { fmtDate, monthKey } from '../domain/dates';
import { samePin, type Pin } from '../domain/pins';
import type { Transaction } from '../domain/types';
import { entityKey, merchantKey } from '../kit/entityKeys';
import { withTransition } from '../kit/transition';
import { useView } from '../kit/view';
import { Money } from './Money';
import { href } from './router';
import { TxList } from './TxList';

export type BreakdownRoot = 'categories' | 'days' | 'compare';

/** Steps below the root: 'c:<category>', 'm:<merchant key>', 'd:<date>'. */
export type BreakdownPath = string[];

interface Props {
  root: BreakdownRoot;
  rootLabel: string;
  /** Entries of the month so far (already narrowed by pins). */
  entries: Transaction[];
  /** For 'compare': last month up to the same day. */
  compareEntries?: Transaction[];
  path: BreakdownPath;
  onPath: (path: BreakdownPath) => void;
  /** First and last date shown, for "Open in Transactions". */
  range: { from: string; to: string };
}

interface Row {
  key: string;
  label: string;
  hl: string;
  value: number;
  sub?: React.ReactNode;
  step: string;
}

function Rows({
  rows,
  currency,
  onStep,
}: {
  rows: Row[];
  currency: string;
  onStep: (s: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="muted small">Nothing here.</p>;
  return (
    <ul className="hbars drill-rows">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            className="hbar drill-row"
            data-hl={r.hl}
            data-entity={r.hl}
            onClick={() => onStep(r.step)}
          >
            <span className="hbar-label">{r.label}</span>
            <Money minor={r.value} currency={currency} />
            {r.sub && <span className="muted small hbar-note">{r.sub}</span>}
            <span className="hbar-track" aria-hidden="true">
              <span className="hbar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PinButton({ pin }: { pin: Pin }) {
  const pinned = useView((s) => s.pins.some((p) => samePin(p, pin)));
  const togglePin = useView((s) => s.togglePin);
  return (
    <button type="button" className="btn" aria-pressed={pinned} onClick={() => togglePin(pin)}>
      {pinned ? `Unpin ${pin.label}` : `Pin ${pin.label} to every page`}
    </button>
  );
}

/**
 * A drill-down with a breadcrumb: categories, then a category's merchants, then a merchant's entries
 * (or days, then a day's entries). Each step can be pinned to filter every page.
 */
export function Breakdown({
  root,
  rootLabel,
  entries,
  compareEntries = [],
  path,
  onPath,
  range,
}: Props) {
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const name = (id: string) => categoryById(categories, id)?.name ?? 'Other';
  const go = (next: BreakdownPath) => withTransition(() => onPath(next));
  const step = (s: string) => go([...path, s]);

  const crumbs: Array<{ label: string; to: BreakdownPath }> = [{ label: rootLabel, to: [] }];
  let list = entries;
  let categoryId: string | null = null;
  let merchant: { key: string; label: string } | null = null;
  let day: string | null = null;
  for (const [i, p] of path.entries()) {
    const [kind, id] = [p.slice(0, 1), p.slice(2)];
    if (kind === 'c') {
      categoryId = id;
      list = list.filter((t) => t.categoryId === id);
      crumbs.push({ label: name(id), to: path.slice(0, i + 1) });
    } else if (kind === 'm') {
      list = list.filter((t) => normalizeMerchantKey(t.merchant) === id);
      merchant = { key: id, label: list[0]?.merchant ?? id };
      crumbs.push({ label: merchant.label, to: path.slice(0, i + 1) });
    } else if (kind === 'd') {
      day = id;
      list = list.filter((t) => t.date === id);
      crumbs.push({ label: fmtDate(id), to: path.slice(0, i + 1) });
    }
  }
  const last = path.at(-1)?.slice(0, 1);

  let body: React.ReactNode;
  if (!last) {
    if (root === 'days') {
      const byDay = new Map<string, Transaction[]>();
      for (const t of list) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
      body = (
        <Rows
          currency={currency}
          onStep={step}
          rows={[...byDay.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([d, ts]) => ({
              key: d,
              label: fmtDate(d),
              hl: entityKey('day', d),
              value: ts.reduce((s, t) => s + t.amountMinor, 0),
              sub: ts.length === 1 ? '1 entry' : `${ts.length} entries`,
              step: `d:${d}`,
            }))}
        />
      );
    } else {
      const month = monthKey(entries[0]?.date ?? range.from);
      const before = new Map(
        categoryTotals(compareEntries, compareEntries[0] ? monthKey(compareEntries[0].date) : '').map((c) => [
          c.categoryId,
          c.totalMinor,
        ]),
      );
      body = (
        <Rows
          currency={currency}
          onStep={step}
          rows={categoryTotals(list, month).map((c) => ({
            key: c.categoryId,
            label: name(c.categoryId),
            hl: entityKey('category', c.categoryId),
            value: c.totalMinor,
            sub:
              root === 'compare' ? (
                <>
                  Last month by now:{' '}
                  <Money minor={before.get(c.categoryId) ?? 0} currency={currency} />
                </>
              ) : undefined,
            step: `c:${c.categoryId}`,
          }))}
        />
      );
    }
  } else if (last === 'c' && categoryId) {
    const byMerchant = new Map<string, Transaction[]>();
    for (const t of list) {
      const k = normalizeMerchantKey(t.merchant) || 'untitled';
      byMerchant.set(k, [...(byMerchant.get(k) ?? []), t]);
    }
    const id: string = categoryId;
    body = (
      <>
        <Rows
          currency={currency}
          onStep={step}
          rows={[...byMerchant.entries()]
            .map(([k, ts]) => ({
              key: k,
              label: ts[0]!.merchant || 'Untitled',
              hl: merchantKey(ts[0]!.merchant),
              value: ts.reduce((s, t) => s + t.amountMinor, 0),
              sub: ts.length === 1 ? '1 entry' : `${ts.length} entries`,
              step: `m:${k}`,
            }))
            .sort((a, b) => b.value - a.value)}
        />
        <div className="btn-row">
          <PinButton pin={{ kind: 'category', id, label: name(id) }} />
          <a
            className="btn btn-ghost"
            href={href(`/transactions?category=${id}&from=${range.from}&to=${range.to}`)}
          >
            Open in Transactions
          </a>
        </div>
      </>
    );
  } else {
    const pin: Pin | null = merchant
      ? { kind: 'merchant', id: merchant.key, label: merchant.label }
      : day
        ? { kind: 'day', id: day, label: fmtDate(day) }
        : null;
    body = (
      <>
        <TxList label={crumbs.at(-1)!.label} transactions={list} />
        {pin && (
          <div className="btn-row">
            <PinButton pin={pin} />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="breakdown" data-testid="breakdown">
      <nav aria-label="Breakdown" className="crumbs">
        <ol>
          {crumbs.map((c, i) => (
            <li key={c.to.join('/') || 'root'}>
              {i === crumbs.length - 1 ? (
                <span aria-current="page">{c.label}</span>
              ) : (
                <button type="button" className="crumb" onClick={() => go(c.to)}>
                  {c.label}
                </button>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <p className="muted small" aria-live="polite">
        <Money minor={list.reduce((s, t) => s + t.amountMinor, 0)} currency={currency} /> in{' '}
        {list.length === 1 ? '1 entry' : `${list.length} entries`}
      </p>
      {body}
    </div>
  );
}
