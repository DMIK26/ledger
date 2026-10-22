import { LoadSampleButton } from '../SampleData';
import { EmptyDoodle } from '../../doodle/Studio';
import { useMemo, useRef, useState } from 'react';
import { newId, useLedger } from '../../data/store';
import { TRASH_DAYS } from '../../data/bus';
import { fmtDate, parseISO, todayISO } from '../../domain/dates';
import { safeText, toCsv } from '../../domain/csv';
import { exportRows } from '../../domain/csvImport';
import {
  allTags,
  applyFilters,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  facetCounts,
  groupTransactions,
  isFiltered,
  pageCount,
  pageSlice,
  sortTransactions,
  type Filters,
  type GroupBy,
  type Sort,
} from '../../domain/filters';
import { CURRENCIES, parseAmountToMinor } from '../../domain/money';
import { normalizeTag } from '../../domain/tags';
import { PAYMENT_METHODS, type PaymentMethod } from '../../domain/types';
import { csvFile, ExportButton } from '../files';
import { useMarquee } from '../../kit/useMarquee';
import { useScopedTransactions } from '../../kit/view';
import { Icon } from '../icons';
import { Money } from '../Money';
import { QuickAdd } from '../QuickAdd';
import { ReceiptViewer } from '../ReceiptViewer';
import { href } from '../router';
import { TxList } from '../TxList';

const SORTS: Array<{ value: string; label: string; sort: Sort }> = [
  { value: 'date-desc', label: 'Newest first', sort: { key: 'date', dir: 'desc' } },
  { value: 'date-asc', label: 'Oldest first', sort: { key: 'date', dir: 'asc' } },
  { value: 'amount-desc', label: 'Largest first', sort: { key: 'amount', dir: 'desc' } },
  { value: 'amount-asc', label: 'Smallest first', sort: { key: 'amount', dir: 'asc' } },
  { value: 'merchant-asc', label: 'Merchant A to Z', sort: { key: 'merchant', dir: 'asc' } },
];
const GROUPS: Array<{ value: GroupBy; label: string }> = [
  { value: 'none', label: 'No grouping' },
  { value: 'day', label: 'By day' },
  { value: 'category', label: 'By category' },
  { value: 'merchant', label: 'By merchant' },
  { value: 'method', label: 'By method' },
];

const sortValue = (s: Sort) => `${s.key}-${s.dir}`;
const toggle = <T,>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

function FilterPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const transactions = useScopedTransactions();
  const categories = useLedger((s) => s.categories);
  const counts = useMemo(() => facetCounts(transactions, filters), [transactions, filters]);
  const tags = useMemo(() => allTags(transactions), [transactions]);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');

  const setAmount = (which: 'minMinor' | 'maxMinor', text: string) => {
    const v = text.trim() ? parseAmountToMinor(text) : null;
    onChange({ ...filters, [which]: v ?? undefined });
  };

  return (
    <section className="card filter-panel" aria-label="Filters">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="f-from">From</label>
          <input
            id="f-from"
            className="input"
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label htmlFor="f-to">To</label>
          <input
            id="f-to"
            className="input"
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label htmlFor="f-min">Amount at least</label>
          <input
            id="f-min"
            className="input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={minText}
            onChange={(e) => {
              setMinText(e.target.value);
              setAmount('minMinor', e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="f-max">Amount at most</label>
          <input
            id="f-max"
            className="input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={maxText}
            onChange={(e) => {
              setMaxText(e.target.value);
              setAmount('maxMinor', e.target.value);
            }}
          />
        </div>
      </div>
      <fieldset className="facet">
        <legend>Category</legend>
        <div className="chips">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip chip-toggle"
              aria-pressed={filters.categories.includes(c.id)}
              onClick={() => onChange({ ...filters, categories: toggle(filters.categories, c.id) })}
            >
              <span className="dot" style={{ background: c.color }} />
              {c.name}
              <span className="count">{counts.categories[c.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="facet">
        <legend>Paid by</legend>
        <div className="chips">
          {PAYMENT_METHODS.map((m: PaymentMethod) => (
            <button
              key={m}
              type="button"
              className="chip chip-toggle"
              aria-pressed={filters.methods.includes(m)}
              onClick={() => onChange({ ...filters, methods: toggle(filters.methods, m) })}
            >
              {m}
              <span className="count">{counts.methods[m] ?? 0}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {tags.length > 0 && (
        <fieldset className="facet">
          <legend>Tags</legend>
          <div className="chips">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                className="chip chip-toggle"
                aria-pressed={filters.tags.includes(t)}
                onClick={() => onChange({ ...filters, tags: toggle(filters.tags, t) })}
              >
                {t}
                <span className="count">{counts.tags[t] ?? 0}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {isFiltered(filters) && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setMinText('');
            setMaxText('');
            onChange(EMPTY_FILTERS);
          }}
        >
          Clear filters
        </button>
      )}
    </section>
  );
}

function BulkBar({
  ids,
  totalMinor,
  onDone,
}: {
  ids: string[];
  totalMinor: number;
  onDone: () => void;
}) {
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const bulkDelete = useLedger((s) => s.bulkDelete);
  const bulkSetCategory = useLedger((s) => s.bulkSetCategory);
  const bulkAddTag = useLedger((s) => s.bulkAddTag);
  const copyToToday = useLedger((s) => s.copyToToday);
  const saveFavourite = useLedger((s) => s.saveFavourite);
  const transactions = useLedger((s) => s.transactions);
  const [tag, setTag] = useState('');
  const single = ids.length === 1 ? transactions.find((t) => t.id === ids[0]) : undefined;

  return (
    <section className="bulk-bar" aria-label="Bulk actions">
      <p aria-live="polite" data-testid="bulk-total">
        {ids.length === 1 ? '1 selected' : `${ids.length} selected`},{' '}
        <Money minor={totalMinor} currency={currency} />
      </p>
      <label className="visually-hidden" htmlFor="bulk-category">
        Move selected to
      </label>
      <select
        id="bulk-category"
        className="select input"
        value=""
        onChange={(e) => {
          if (e.target.value) void bulkSetCategory(ids, e.target.value).then(onDone);
        }}
      >
        <option value="">Move to…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <form
        className="bulk-tag"
        onSubmit={(e) => {
          e.preventDefault();
          const t = normalizeTag(tag);
          if (t) void bulkAddTag(ids, t).then(onDone);
          setTag('');
        }}
      >
        <label className="visually-hidden" htmlFor="bulk-tag">
          Tag to add
        </label>
        <input
          id="bulk-tag"
          className="input"
          placeholder="Add tag"
          autoComplete="off"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <button type="submit" className="btn">
          Tag
        </button>
      </form>
      <button type="button" className="btn" onClick={() => void copyToToday(ids).then(onDone)}>
        <Icon name="copy" />
        Copy to today
      </button>
      {single && (
        <button
          type="button"
          className="btn"
          onClick={() => void saveFavourite(single).then(onDone)}
        >
          <Icon name="star" />
          Save as favourite
        </button>
      )}
      <button type="button" className="btn" onClick={() => void bulkDelete(ids).then(onDone)}>
        <Icon name="trash" />
        Delete
      </button>
      <button type="button" className="btn btn-ghost" onClick={onDone}>
        Clear selection
      </button>
    </section>
  );
}

function SavedViews({
  current,
  onApply,
}: {
  current: { filters: Filters; sort: Sort; groupBy: GroupBy };
  onApply: (v: { filters: Filters; sort: Sort; groupBy: GroupBy }) => void;
}) {
  const views = useLedger((s) => s.views);
  const saveView = useLedger((s) => s.saveView);
  const deleteView = useLedger((s) => s.deleteView);
  const [activeId, setActiveId] = useState('');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className="saved-views">
      <label className="visually-hidden" htmlFor="view-select">
        Saved view
      </label>
      <select
        id="view-select"
        className="select input"
        value={activeId}
        onChange={(e) => {
          setActiveId(e.target.value);
          const v = views.find((x) => x.id === e.target.value);
          if (v) onApply(v);
        }}
      >
        <option value="">Saved views</option>
        {views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      {activeId && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            void deleteView(activeId);
            setActiveId('');
          }}
        >
          Delete view
        </button>
      )}
      {naming ? (
        <form
          className="bulk-tag"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            const id = newId();
            void saveView({ id, name: n, ...current });
            setActiveId(id);
            setNaming(false);
            setName('');
          }}
        >
          <label className="visually-hidden" htmlFor="view-name">
            View name
          </label>
          <input
            id="view-name"
            className="input"
            placeholder="Name this view"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn">
            Save
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setNaming(true)}>
          Save view
        </button>
      )}
    </div>
  );
}

function TrashView() {
  const trash = useLedger((s) => s.trash);
  const restore = useLedger((s) => s.restore);
  const purge = useLedger((s) => s.purge);
  const [now] = useState(() => Date.now());

  return (
    <>
      <p>
        <a href={href('/transactions')}>Back to transactions</a>
      </p>
      {trash.length === 0 ? (
        <section className="card empty">
          <EmptyDoodle art="jar" />
          <h2>Trash is empty</h2>
          <p className="muted">Deleted entries stay here for {TRASH_DAYS} days.</p>
        </section>
      ) : (
        <section className="card" aria-labelledby="trash-title">
          <h2 id="trash-title">Trash</h2>
          <p className="muted small">
            Entries are removed for good {TRASH_DAYS} days after deletion.
          </p>
          <ul className="tx-list" aria-label="Deleted entries">
            {trash.map((item) => {
              const left = Math.max(
                0,
                TRASH_DAYS - Math.floor((now - item.deletedAt) / 86_400_000),
              );
              return (
                <li key={item.id} className="trash-row" data-testid="trash-row">
                  <span className="tx-merchant">
                    <span>{item.tx.merchant || 'Untitled'}</span>
                    <span className="tx-raw">
                      {fmtDate(item.tx.date)} · {left === 1 ? '1 day left' : `${left} days left`}
                    </span>
                  </span>
                  <Money
                    className="tx-amount"
                    minor={item.tx.amountMinor}
                    currency={item.tx.currency}
                  />
                  <span className="btn-row">
                    <button type="button" className="btn" onClick={() => void restore(item.id)}>
                      Restore
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void purge(item.id)}
                    >
                      Delete for good
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function Ledger({ initialFilters }: { initialFilters: Filters }) {
  const transactions = useScopedTransactions();
  const allCount = useLedger((s) => s.transactions.length);
  const listRef = useRef<HTMLElement>(null);
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const trashCount = useLedger((s) => s.trash.length);
  const removeTransaction = useLedger((s) => s.removeTransaction);

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(() => isFiltered(initialFilters));
  const [panelKey, setPanelKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const filtered = useMemo(
    () => sortTransactions(applyFilters(transactions, filters), sort),
    [transactions, filters, sort],
  );
  const pages = pageCount(filtered.length);
  const current = Math.min(page, pages);
  const visible = pageSlice(filtered, current);
  const groups = groupTransactions(visible, groupBy, categories);
  const total = filtered.reduce((s, t) => s + t.amountMinor, 0);
  const activeFilters =
    filters.categories.length +
    filters.methods.length +
    filters.tags.length +
    (filters.from || filters.to ? 1 : 0) +
    (filters.minMinor !== undefined || filters.maxMinor !== undefined ? 1 : 0);

  // Drop selections that are no longer visible in the filtered list.
  const selectedIds = [...selected].filter((id) => filtered.some((t) => t.id === id));
  const allOnPage = visible.length > 0 && visible.every((t) => selected.has(t.id));

  const changeFilters = (f: Filters) => {
    setFilters(f);
    setPage(1);
  };

  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const marquee = useMarquee(listRef, (ids, additive) =>
    setSelected((cur) => (additive ? new Set([...cur, ...ids]) : new Set(ids))),
  );
  const shownSelected =
    marquee.preview.size > 0 ? new Set([...selected, ...marquee.preview]) : selected;

  if (allCount === 0) {
    return (
      <>
        <QuickAdd />
        <section className="card empty">
          <EmptyDoodle art="receipt" />
          <h2>Nothing logged yet</h2>
          <p className="muted">Every expense you add shows up here, newest first.</p>
          <div className="btn-row empty-actions">
            <LoadSampleButton />
          </div>
        </section>
        {trashCount > 0 && (
          <p>
            <a href={href('/transactions?view=trash')}>Trash ({trashCount})</a>
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <QuickAdd />
      <div className="toolbar">
        <button
          type="button"
          className="btn"
          aria-expanded={filtersOpen}
          aria-controls="filter-panel"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <Icon name="filter" />
          {activeFilters > 0 ? `Filters (${activeFilters})` : 'Filters'}
        </button>
        <label className="visually-hidden" htmlFor="sort-select">
          Sort
        </label>
        <select
          id="sort-select"
          className="select input"
          value={sortValue(sort)}
          onChange={(e) =>
            setSort(SORTS.find((s) => s.value === e.target.value)?.sort ?? DEFAULT_SORT)
          }
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor="group-select">
          Group
        </label>
        <select
          id="group-select"
          className="select input"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
        >
          {GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <SavedViews
          current={{ filters, sort, groupBy }}
          onApply={(v) => {
            changeFilters(v.filters);
            setSort(v.sort);
            setGroupBy(v.groupBy);
            setPanelKey((k) => k + 1);
          }}
        />
        <ExportButton
          label="Export CSV"
          className="btn btn-ghost"
          disabled={filtered.length === 0}
          build={() =>
            csvFile(
              `ledger-transactions-${todayISO()}.csv`,
              toCsv(
                exportRows(
                  filtered,
                  categories,
                  safeText,
                  (CURRENCIES[currency] ?? CURRENCIES.INR!).symbol,
                ),
              ),
            )
          }
        />
        <a className="btn btn-ghost" href={href('/transactions?view=trash')}>
          {trashCount > 0 ? `Trash (${trashCount})` : 'Trash'}
        </a>
      </div>
      {filtersOpen && (
        <div id="filter-panel">
          <FilterPanel key={panelKey} filters={filters} onChange={changeFilters} />
        </div>
      )}
      {selectedIds.length > 0 && (
        <BulkBar
          ids={selectedIds}
          totalMinor={filtered
            .filter((t) => selected.has(t.id))
            .reduce((sum, t) => sum + t.amountMinor, 0)}
          onDone={() => setSelected(new Set())}
        />
      )}
      {filtered.length === 0 ? (
        <section className="card empty">
          <EmptyDoodle art="receipt" />
          <h2>No matches</h2>
          <p className="muted">Nothing fits these filters.</p>
          <p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                changeFilters(EMPTY_FILTERS);
                setPanelKey((k) => k + 1);
              }}
            >
              Clear filters
            </button>
          </p>
        </section>
      ) : (
        <section
          className="card marquee-area"
          aria-label="All transactions"
          ref={listRef}
          {...marquee.handlers}
        >
          {marquee.rect && (
            <span
              className="marquee"
              aria-hidden="true"
              style={{
                left: marquee.rect.left,
                top: marquee.rect.top,
                width: marquee.rect.width,
                height: marquee.rect.height,
              }}
            />
          )}
          <label className="select-all">
            <input
              type="checkbox"
              className="checkbox"
              checked={allOnPage}
              onChange={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  for (const t of visible) {
                    if (allOnPage) next.delete(t.id);
                    else next.add(t.id);
                  }
                  return next;
                })
              }
            />
            Select all on this page
          </label>
          {groups.map((g) => (
            <div key={g.key} className="tx-group">
              {groupBy !== 'none' && (
                <h3 className="group-head">
                  <span>{g.label}</span>
                  <Money minor={g.totalMinor} currency={currency} />
                </h3>
              )}
              <TxList
                label={g.label || 'Transactions'}
                transactions={g.items}
                onDelete={(id) => void removeTransaction(id)}
                onEdit={setEditingId}
                onReceipt={setReceiptId}
                selected={shownSelected}
                onToggle={toggleOne}
                editingId={editingId}
              />
            </div>
          ))}
          {pages > 1 && (
            <nav className="pager" aria-label="Pages">
              <button
                type="button"
                className="btn"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                Previous
              </button>
              <span className="muted small">
                Page {current} of {pages}
              </span>
              <button
                type="button"
                className="btn"
                disabled={current >= pages}
                onClick={() => setPage(current + 1)}
              >
                Next
              </button>
            </nav>
          )}
          <div className="tx-footer" data-testid="tx-footer">
            <span>
              {filtered.length === 1 ? '1 transaction' : `${filtered.length} transactions`}
            </span>
            <Money minor={total} currency={currency} />
          </div>
        </section>
      )}
      <ReceiptViewer id={receiptId} onClose={() => setReceiptId(null)} />
    </>
  );
}

/** Filters passed in the address, e.g. from a donut slice: ?category=food&from=2026-10-01&to=2026-10-19 */
export function filtersFromQuery(query: URLSearchParams): Filters {
  const date = (v: string | null) => (v && parseISO(v) ? v : undefined);
  const category = query.get('category');
  return {
    ...EMPTY_FILTERS,
    categories: category ? [category] : [],
    from: date(query.get('from')),
    to: date(query.get('to')),
  };
}

export function Transactions({
  view,
  initialFilters = EMPTY_FILTERS,
}: {
  view?: string | null;
  initialFilters?: Filters;
}) {
  return view === 'trash' ? <TrashView /> : <Ledger initialFilters={initialFilters} />;
}
