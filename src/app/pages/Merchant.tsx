import { useMemo, useState } from 'react';
import { EmptyDoodle } from '../../doodle/Studio';
import { useLedger } from '../../data/store';
import { categorise } from '../../domain/categoriser';
import { categoryById } from '../../domain/categories';
import { fmtDate, monthLabel, todayISO } from '../../domain/dates';
import { merchantStats } from '../../domain/merchant';
import { firstRule } from '../../domain/rules';
import { useView } from '../../kit/view';
import { Money } from '../Money';
import { ReceiptViewer } from '../ReceiptViewer';
import { href } from '../router';
import { TxList } from '../TxList';

const PAGE = 30;

/** Twelve monthly columns, each with its month and amount for screen readers. */
function MonthColumns({
  months,
  currency,
}: {
  months: Array<{ month: string; totalMinor: number }>;
  currency: string;
}) {
  const max = Math.max(1, ...months.map((m) => m.totalMinor));
  return (
    <ol className="month-cols" aria-label="Spent each month">
      {months.map((m) => (
        <li key={m.month} className="month-col">
          <span className="month-col-track" aria-hidden="true">
            <span
              className="month-col-bar"
              style={{
                height: `${Math.max(m.totalMinor > 0 ? 3 : 0, (m.totalMinor / max) * 100)}%`,
              }}
            />
          </span>
          <span className="month-col-label" aria-hidden="true">
            {monthLabel(m.month).slice(0, 3)}
          </span>
          <span className="visually-hidden">
            {monthLabel(m.month)}: <Money minor={m.totalMinor} currency={currency} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * A merchant's page (Drop 12, after Apple Card): totals, how often, the rule that files it, twelve
 * months as columns, and the whole history with edit and delete.
 */
export function MerchantPage({ merchantKey }: { merchantKey: string }) {
  const transactions = useLedger((s) => s.transactions);
  const categories = useLedger((s) => s.categories);
  const rules = useLedger((s) => s.rules);
  const customRules = useLedger((s) => s.customRules);
  const currency = useLedger((s) => s.settings.currency);
  const removeTransaction = useLedger((s) => s.removeTransaction);
  const pins = useView((s) => s.pins);
  const togglePin = useView((s) => s.togglePin);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const today = todayISO();
  const stats = useMemo(
    () => merchantStats(merchantKey, transactions, today),
    [merchantKey, transactions, today],
  );

  if (!stats) {
    return (
      <section className="card empty">
        <EmptyDoodle art="receipt" />
        <h2>No entries for this merchant</h2>
        <p className="muted">
          It may have been renamed or deleted. <a href={href('/transactions')}>See all entries</a>.
        </p>
      </section>
    );
  }

  const name = (id: string) => categoryById(categories, id)?.name ?? 'Other';
  const rule = firstRule(customRules, {
    merchant: stats.name,
    amountMinor: stats.averageMinor,
    method: stats.usualMethod,
  });
  const learned = rules[merchantKey];
  const guess = categorise(stats.name, rules);
  const filedAs = rule?.set.categoryId
    ? `Your rule for “${rule.text}” files it under ${name(rule.set.categoryId)}.`
    : learned
      ? `Ledger files it under ${name(learned)}, learned from your choices.`
      : guess.confidence !== 'none'
        ? `Ledger files it under ${name(guess.categoryId)} from its name.`
        : 'Ledger does not know where it goes yet; it is marked unsure.';
  const pinned = pins.some((p) => p.kind === 'merchant' && p.id === merchantKey);
  const since =
    stats.daysSinceLast === 0
      ? 'today'
      : stats.daysSinceLast === 1
        ? 'yesterday'
        : `${stats.daysSinceLast} days ago`;

  return (
    <>
      <section className="card" aria-labelledby="merchant-title" data-testid="merchant-page">
        <div className="card-head">
          <h2 id="merchant-title">{stats.name}</h2>
          <span className="muted small">
            Usually {name(stats.usualCategoryId)}, {stats.usualMethod}
          </span>
        </div>
        <dl className="facts">
          <div>
            <dt>All time</dt>
            <dd data-testid="merchant-total">
              <Money minor={stats.totalMinor} currency={currency} />
            </dd>
          </div>
          <div>
            <dt>This month</dt>
            <dd>
              <Money minor={stats.thisMonthMinor} currency={currency} />
            </dd>
          </div>
          <div>
            <dt>Entries</dt>
            <dd>{stats.count}</dd>
          </div>
          <div>
            <dt>Average per entry</dt>
            <dd>
              <Money minor={stats.averageMinor} currency={currency} />
            </dd>
          </div>
          <div>
            <dt>Last visit</dt>
            <dd>
              {fmtDate(stats.last)}, {since}
            </dd>
          </div>
          <div>
            <dt>First visit</dt>
            <dd>{fmtDate(stats.first)}</dd>
          </div>
          {stats.everyDays !== null && (
            <div>
              <dt>How often</dt>
              <dd>
                {stats.everyDays <= 1 ? 'About every day' : `About every ${stats.everyDays} days`}
              </dd>
            </div>
          )}
        </dl>
        <p className="muted small">{filedAs}</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            aria-pressed={pinned}
            onClick={() => togglePin({ kind: 'merchant', id: merchantKey, label: stats.name })}
          >
            {pinned ? 'Pinned to every page' : 'Pin to every page'}
          </button>
          <a
            className="btn btn-ghost"
            href={href(`/settings?view=rules&merchant=${encodeURIComponent(stats.name)}`)}
          >
            Make a rule
          </a>
        </div>
      </section>

      <section className="card" aria-labelledby="merchant-months-title">
        <h2 id="merchant-months-title">Last 12 months</h2>
        <MonthColumns months={stats.months} currency={currency} />
      </section>

      <section className="card" aria-labelledby="merchant-history-title">
        <div className="card-head">
          <h2 id="merchant-history-title">History</h2>
          <span className="muted small">
            {stats.count === 1 ? '1 entry' : `${stats.count} entries`}
          </span>
        </div>
        <TxList
          label={`Entries from ${stats.name}`}
          transactions={stats.entries.slice(0, shown)}
          onDelete={(id) => void removeTransaction(id)}
          onEdit={setEditingId}
          onReceipt={setReceiptId}
          editingId={editingId}
        />
        {stats.entries.length > shown && (
          <button type="button" className="btn btn-ghost" onClick={() => setShown((s) => s + PAGE)}>
            Show more
          </button>
        )}
      </section>
      <ReceiptViewer id={receiptId} onClose={() => setReceiptId(null)} />
    </>
  );
}
