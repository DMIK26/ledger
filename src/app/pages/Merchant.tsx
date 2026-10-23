import { useMemo, useState } from 'react';
import { EmptyDoodle } from '../../doodle/bits';
import { useLedger } from '../../data/store';
import { categorise } from '../../domain/categoriser';
import { categoryById } from '../../domain/categories';
import { fmtDate, monthLabel, monthShortLabel, todayISO } from '../../domain/dates';
import { merchantStats } from '../../domain/merchant';
import { firstRule } from '../../domain/rules';
import { useView } from '../../kit/view';
import { Money } from '../Money';
import { ReceiptViewer } from '../ReceiptViewer';
import { href } from '../router';
import { TxList } from '../TxList';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

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
    <ol className="month-cols" aria-label={tl('Spent each month')}>
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
            {monthShortLabel(m.month)}
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
        <h2>{tl('No entries for this merchant')}</h2>
        <p className="muted">
          {tr(
            'It may have been renamed or deleted. {0}.',
            <a href={href('/transactions')}>{tl('See all entries')}</a>,
          )}
        </p>
      </section>
    );
  }

  const name = (id: string) => categoryById(categories, id)?.name ?? tl('Other');
  const rule = firstRule(customRules, {
    merchant: stats.name,
    amountMinor: stats.averageMinor,
    method: stats.usualMethod,
  });
  const learned = rules[merchantKey];
  const guess = categorise(stats.name, rules);
  const filedAs = rule?.set.categoryId
    ? tl('Your rule for “{0}” files it under {1}.', rule.text, name(rule.set.categoryId))
    : learned
      ? tl('Ledger files it under {0}, learned from your choices.', name(learned))
      : guess.confidence !== 'none'
        ? tl('Ledger files it under {0} from its name.', name(guess.categoryId))
        : tl('Ledger does not know where it goes yet; it is marked unsure.');
  const pinned = pins.some((p) => p.kind === 'merchant' && p.id === merchantKey);
  const since =
    stats.daysSinceLast === 0
      ? tl('today')
      : stats.daysSinceLast === 1
        ? tl('yesterday')
        : tl('{0} days ago', stats.daysSinceLast);

  return (
    <>
      <section className="card" aria-labelledby="merchant-title" data-testid="merchant-page">
        <div className="card-head">
          <h2 id="merchant-title">{stats.name}</h2>
          <span className="muted small">
            {tl('Usually {0}, {1}', name(stats.usualCategoryId), stats.usualMethod)}
          </span>
        </div>
        <dl className="facts">
          <div>
            <dt>{tl('All time')}</dt>
            <dd data-testid="merchant-total">
              <Money minor={stats.totalMinor} currency={currency} />
            </dd>
          </div>
          <div>
            <dt>{tl('This month')}</dt>
            <dd>
              <Money minor={stats.thisMonthMinor} currency={currency} />
            </dd>
          </div>
          <div>
            <dt>{tl('Entries')}</dt>
            <dd>{stats.count}</dd>
          </div>
          <div>
            <dt>{tl('Average per entry')}</dt>
            <dd>
              <Money minor={stats.averageMinor} currency={currency} />
            </dd>
          </div>
          <div>
            <dt>{tl('Last visit')}</dt>
            <dd>
              {fmtDate(stats.last)}, {since}
            </dd>
          </div>
          <div>
            <dt>{tl('First visit')}</dt>
            <dd>{fmtDate(stats.first)}</dd>
          </div>
          {stats.everyDays !== null && (
            <div>
              <dt>{tl('How often')}</dt>
              <dd>
                {stats.everyDays <= 1
                  ? tl('About every day')
                  : tl('About every {0} days', stats.everyDays)}
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
            {pinned ? tl('Pinned to every page') : tl('Pin to every page')}
          </button>
          <a
            className="btn btn-ghost"
            href={href(`/settings?view=rules&merchant=${encodeURIComponent(stats.name)}`)}
          >
            {tl('Make a rule')}
          </a>
        </div>
      </section>

      <section className="card" aria-labelledby="merchant-months-title">
        <h2 id="merchant-months-title">{tl('Last 12 months')}</h2>
        <MonthColumns months={stats.months} currency={currency} />
      </section>

      <section className="card" aria-labelledby="merchant-history-title">
        <div className="card-head">
          <h2 id="merchant-history-title">{tl('History')}</h2>
          <span className="muted small">
            {stats.count === 1 ? tl('1 entry') : tl('{0} entries', stats.count)}
          </span>
        </div>
        <TxList
          label={tl('Entries from {0}', stats.name)}
          transactions={stats.entries.slice(0, shown)}
          onDelete={(id) => void removeTransaction(id)}
          onEdit={setEditingId}
          onReceipt={setReceiptId}
          editingId={editingId}
        />
        {stats.entries.length > shown && (
          <button type="button" className="btn btn-ghost" onClick={() => setShown((s) => s + PAGE)}>
            {tl('Show more')}
          </button>
        )}
      </section>
      <ReceiptViewer id={receiptId} onClose={() => setReceiptId(null)} />
    </>
  );
}
