import { LoadSampleButton } from '../SampleData';
import { EmptyDoodle } from '../../doodle/bits';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { newId, useLedger, viewOf } from '../../data/store';
import { TRASH_DAYS } from '../../data/bus';
import { fmtDate, todayISO } from '../../domain/dates';
import { safeText, toCsv } from '../../domain/csv';
import { exportRows } from '../../domain/csvExport';
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
import { methodLabel, PAYMENT_METHODS, type PaymentMethod } from '../../domain/types';
import { forWhomNames } from '../../domain/forWhom';
import type { SearchQuery } from '../../domain/search';
import { findSubcategory } from '../../domain/subcategories';
import { csvFile, ExportButton } from '../files';
import { useMarquee } from '../../kit/useMarquee';
import { useScopedTransactions } from '../../kit/view';
import { Icon } from '../icons';
import { Money } from '../Money';
import { QuickAdd } from '../QuickAdd';
import { ReceiptViewer } from '../ReceiptViewer';
import { href } from '../router';
import { TxList } from '../TxList';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

// Loaded on first use, so the list stays quick to open.
const CalendarView = lazy(() =>
  import('../views/Calendar').then((m) => ({ default: m.CalendarView })),
);
const ReviewView = lazy(() => import('../views/Review').then((m) => ({ default: m.ReviewView })));
const WarrantiesView = lazy(() =>
  import('../views/Warranties').then((m) => ({ default: m.WarrantiesView })),
);

const FLAG_LABEL = {
  get tax() {
    return tl('Tax deduction');
  },
  get warranty() {
    return tl('Has a warranty');
  },
  get receipt() {
    return tl('Has a receipt');
  },
  get split() {
    return tl('Split');
  },
  get unsure() {
    return tl('Unsure');
  },
} as const;

/** What the search understood, as chips (amounts through Money, so privacy mode hides them). */
function SearchChips({ q }: { q: SearchQuery }) {
  const categories = useLedger((s) => s.categories);
  const projects = useLedger((s) => s.projects);
  const currency = useLedger((s) => s.settings.currency);
  const chips: ReactNode[] = [];
  const m = (minor: number) => <Money minor={minor} currency={currency} />;
  if (q.period) chips.push(q.period.label);
  const a = q.amount;
  if (a)
    chips.push(
      a.kind === 'between' ? (
        <>{tr('{0} to {1}', m(a.minor), m(a.to))}</>
      ) : (
        <>
          {
            {
              over: tl('Over'),
              under: tl('Under'),
              atLeast: tl('At least'),
              atMost: tl('Up to'),
              exact: tl('Exactly'),
            }[a.kind]
          }{' '}
          {m(a.minor)}
        </>
      ),
    );
  for (const id of q.categoryIds) chips.push(categories.find((c) => c.id === id)?.name ?? id);
  for (const id of q.subcategoryIds) chips.push(findSubcategory(categories, id)?.sub.name ?? id);
  for (const x of q.methods) chips.push(x);
  for (const t of q.tags) chips.push(`#${t}`);
  for (const w of q.forWhom) chips.push(w ? tl('For {0}', w) : tl('For you'));
  for (const id of q.projectIds) chips.push(projects.find((p) => p.id === id)?.name ?? id);
  for (const x of q.taxSections) chips.push(tl('Tax {0}', x));
  for (const f of q.flags) chips.push(FLAG_LABEL[f]);
  for (const w of q.words) chips.push(`“${w}”`);
  return (
    <p className="search-chips" aria-live="polite" data-testid="search-chips">
      <span className="muted small">{tl('Looking for')}</span>
      {chips.map((c, i) => (
        <span key={i} className="chip">
          {c}
        </span>
      ))}
    </p>
  );
}

/**
 * Plain-words search (Drop 12). The typed text is set as a property only, like AmountInput, so an
 * amount typed here never lands in a DOM attribute while privacy mode is on.
 */
function SearchBox({ initial, onChange }: { initial: string; onChange: (text: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState(initial !== '');
  useEffect(() => {
    if (ref.current) ref.current.value = initial;
    // Only on mount: the page remounts when the address (and so ?q=) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <form className="search-box" role="search" onSubmit={(e) => e.preventDefault()}>
      <label className="visually-hidden" htmlFor="tx-search">
        {tl('Search entries')}
      </label>
      <Icon name="search" />
      <input
        ref={ref}
        id="tx-search"
        className="input"
        type="search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={tl('Search: food last month over 500 upi')}
        onChange={(e) => {
          setHasText(e.target.value !== '');
          onChange(e.target.value);
        }}
      />
      {hasText && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (ref.current) ref.current.value = '';
            setHasText(false);
            onChange('');
          }}
        >
          {tl('Clear search')}
        </button>
      )}
    </form>
  );
}

const COLUMNS: Array<{ id: string; label: string }> = [
  {
    id: 'category',
    get label() {
      return tl('Category');
    },
  },
  {
    id: 'method',
    get label() {
      return tl('Method');
    },
  },
  {
    id: 'account',
    get label() {
      return tl('Account');
    },
  },
  {
    id: 'tags',
    get label() {
      return tl('Tags');
    },
  },
];

/** Columns: which parts of each row Transactions shows. Saved on this device. */
function ColumnsMenu() {
  const hidden = useLedger((s) => s.settings.hiddenColumns);
  const setSetting = useLedger((s) => s.setSetting);
  return (
    <details className="columns-menu">
      <summary className="btn btn-ghost">{tl('Columns')}</summary>
      <fieldset className="columns-panel">
        <legend className="visually-hidden">{tl('Show these columns')}</legend>
        {COLUMNS.map((c) => (
          <label key={c.id} className="check">
            <input
              type="checkbox"
              checked={!hidden.includes(c.id)}
              onChange={(e) =>
                void setSetting(
                  'hiddenColumns',
                  e.target.checked ? hidden.filter((h) => h !== c.id) : [...hidden, c.id],
                )
              }
            />
            {c.label}
          </label>
        ))}
      </fieldset>
    </details>
  );
}

function ViewTabs({ current }: { current: 'list' | 'calendar' | 'review' }) {
  const unsure = useLedger((s) => s.transactions.filter((t) => t.unsure).length);
  const tabs: Array<{ id: typeof current; label: string; to: string }> = [
    { id: 'list', label: tl('List'), to: '/transactions' },
    { id: 'calendar', label: tl('Calendar'), to: '/transactions?view=calendar' },
    {
      id: 'review',
      label: unsure > 0 ? tl('Review ({0})', unsure) : tl('Review'),
      to: '/transactions?view=review',
    },
  ];
  return (
    <div className="segmented page-views" role="group" aria-label={tl('Show')}>
      {tabs.map((t) => (
        <a
          key={t.id}
          className="segmented-link"
          href={href(t.to)}
          aria-current={current === t.id ? 'page' : undefined}
        >
          {t.label}
        </a>
      ))}
    </div>
  );
}

const SORTS: Array<{ value: string; label: string; sort: Sort }> = [
  {
    value: 'date-desc',
    get label() {
      return tl('Newest first');
    },
    sort: { key: 'date', dir: 'desc' },
  },
  {
    value: 'date-asc',
    get label() {
      return tl('Oldest first');
    },
    sort: { key: 'date', dir: 'asc' },
  },
  {
    value: 'amount-desc',
    get label() {
      return tl('Largest first');
    },
    sort: { key: 'amount', dir: 'desc' },
  },
  {
    value: 'amount-asc',
    get label() {
      return tl('Smallest first');
    },
    sort: { key: 'amount', dir: 'asc' },
  },
  {
    value: 'merchant-asc',
    get label() {
      return tl('Merchant A to Z');
    },
    sort: { key: 'merchant', dir: 'asc' },
  },
];
const GROUPS: Array<{ value: GroupBy; label: string }> = [
  {
    value: 'none',
    get label() {
      return tl('No grouping');
    },
  },
  {
    value: 'day',
    get label() {
      return tl('By day');
    },
  },
  {
    value: 'category',
    get label() {
      return tl('By category');
    },
  },
  {
    value: 'merchant',
    get label() {
      return tl('By merchant');
    },
  },
  {
    value: 'method',
    get label() {
      return tl('By method');
    },
  },
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
    <section className="card filter-panel" aria-label={tl('Filters')}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="f-from">{tl('From')}</label>
          <input
            id="f-from"
            className="input"
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label htmlFor="f-to">{tl('To')}</label>
          <input
            id="f-to"
            className="input"
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label htmlFor="f-min">{tl('Amount at least')}</label>
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
          <label htmlFor="f-max">{tl('Amount at most')}</label>
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
        <legend>{tl('Category')}</legend>
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
        <legend>{tl('Paid by')}</legend>
        <div className="chips">
          {PAYMENT_METHODS.map((m: PaymentMethod) => (
            <button
              key={m}
              type="button"
              className="chip chip-toggle"
              aria-pressed={filters.methods.includes(m)}
              onClick={() => onChange({ ...filters, methods: toggle(filters.methods, m) })}
            >
              {methodLabel(m)}
              <span className="count">{counts.methods[m] ?? 0}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {tags.length > 0 && (
        <fieldset className="facet">
          <legend>{tl('Tags')}</legend>
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
          {tl('Clear filters')}
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
  const setEntriesProject = useLedger((s) => s.setEntriesProject);
  const moveToSpace = useLedger((s) => s.moveToSpace);
  const spacesOn = useLedger((s) => s.settings.spacesOn);
  const view = useLedger((s) => viewOf(s.settings));
  const shopName = tl(useLedger((s) => s.settings.shopName) || 'Shop');
  const allProjects = useLedger((s) => s.projects);
  const projects = allProjects.filter((p) => !p.archived);
  const transactions = useLedger((s) => s.transactions);
  const [tag, setTag] = useState('');
  const single = ids.length === 1 ? transactions.find((t) => t.id === ids[0]) : undefined;

  return (
    <section className="bulk-bar" aria-label={tl('Bulk actions')}>
      <p aria-live="polite" data-testid="bulk-total">
        {ids.length === 1 ? tl('1 selected') : tl('{0} selected', ids.length)},{' '}
        <Money minor={totalMinor} currency={currency} />
      </p>
      <label className="visually-hidden" htmlFor="bulk-category">
        {tl('Move selected to')}
      </label>
      <select
        id="bulk-category"
        className="select input"
        value=""
        onChange={(e) => {
          if (e.target.value) void bulkSetCategory(ids, e.target.value).then(onDone);
        }}
      >
        <option value="">{tl('Move to…')}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {projects.length > 0 && (
        <>
          <label className="visually-hidden" htmlFor="bulk-project">
            {tl('Add selected to a trip or project')}
          </label>
          <select
            id="bulk-project"
            className="select input"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) void setEntriesProject(ids, v === 'none' ? null : v).then(onDone);
            }}
          >
            <option value="">{tl('Trip or project…')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="none">{tl('No trip or project')}</option>
          </select>
        </>
      )}
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
          {tl('Tag to add')}
        </label>
        <input
          id="bulk-tag"
          className="input"
          placeholder={tl('Add tag')}
          autoComplete="off"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <button type="submit" className="btn">
          {tl('Tag')}
        </button>
      </form>
      {spacesOn && view !== 'shop' && (
        <button
          type="button"
          className="btn"
          onClick={() => void moveToSpace(ids, 'shop').then(onDone)}
        >
          {tl('Move to {0}', shopName)}
        </button>
      )}
      {spacesOn && view !== 'personal' && (
        <button
          type="button"
          className="btn"
          onClick={() => void moveToSpace(ids, 'personal').then(onDone)}
        >
          {tl('Move to Personal')}
        </button>
      )}
      <button type="button" className="btn" onClick={() => void copyToToday(ids).then(onDone)}>
        <Icon name="copy" />
        {tl('Copy to today')}
      </button>
      {single && (
        <button
          type="button"
          className="btn"
          onClick={() => void saveFavourite(single).then(onDone)}
        >
          <Icon name="star" />
          {tl('Save as favourite')}
        </button>
      )}
      <button type="button" className="btn" onClick={() => void bulkDelete(ids).then(onDone)}>
        <Icon name="trash" />
        {tl('Delete')}
      </button>
      <button type="button" className="btn btn-ghost" onClick={onDone}>
        {tl('Clear selection')}
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
        {tl('Saved view')}
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
        <option value="">{tl('Saved views')}</option>
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
          {tl('Delete view')}
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
            {tl('View name')}
          </label>
          <input
            id="view-name"
            className="input"
            placeholder={tl('Name this view')}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn">
            {tl('Save')}
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setNaming(true)}>
          {tl('Save view')}
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
        <a href={href('/transactions')}>{tl('Back to transactions')}</a>
      </p>
      {trash.length === 0 ? (
        <section className="card empty">
          <EmptyDoodle art="jar" />
          <h2>{tl('Trash is empty')}</h2>
          <p className="muted">{tl('Deleted entries stay here for {0} days.', TRASH_DAYS)}</p>
        </section>
      ) : (
        <section className="card" aria-labelledby="trash-title">
          <h2 id="trash-title">{tl('Trash')}</h2>
          <p className="muted small">
            {tl('Entries are removed for good {0} days after deletion.', TRASH_DAYS)}
          </p>
          <ul className="tx-list" aria-label={tl('Deleted entries')}>
            {trash.map((item) => {
              const left = Math.max(
                0,
                TRASH_DAYS - Math.floor((now - item.deletedAt) / 86_400_000),
              );
              return (
                <li key={item.id} className="trash-row" data-testid="trash-row">
                  <span className="tx-merchant">
                    <span>{item.tx.merchant || tl('Untitled')}</span>
                    <span className="tx-raw">
                      {fmtDate(item.tx.date)} ·{' '}
                      {left === 1 ? tl('1 day left') : tl('{0} days left', left)}
                    </span>
                  </span>
                  <Money
                    className="tx-amount"
                    minor={item.tx.amountMinor}
                    currency={item.tx.currency}
                  />
                  <span className="btn-row">
                    <button type="button" className="btn" onClick={() => void restore(item.id)}>
                      {tl('Restore')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void purge(item.id)}
                    >
                      {tl('Delete for good')}
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

function Ledger({
  initialFilters,
  initialSearch,
}: {
  initialFilters: Filters;
  initialSearch: string;
}) {
  const transactions = useScopedTransactions();
  const everything = useLedger((s) => s.transactions);
  const projects = useLedger((s) => s.projects);
  const people = useLedger((s) => s.people);
  const fyStart = useLedger((s) => s.settings.fyStartMonth);
  const [search, setSearch] = useState(initialSearch);
  // The search's words are only loaded once someone searches (Drop 12), to keep start-up small.
  const [searchMod, setSearchMod] = useState<typeof import('../../domain/search') | null>(null);
  const loadSearch = useCallback(() => {
    if (!searchMod) void import('../../domain/search').then((m) => setSearchMod(m));
  }, [searchMod]);
  useEffect(() => {
    if (initialSearch) loadSearch();
  }, [initialSearch, loadSearch]);
  const names = useMemo(
    () => [...forWhomNames(everything), ...people.map((p) => p.name)],
    [everything, people],
  );
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
  const lastToggled = useRef<string | null>(null);
  const hiddenColumns = useLedger((s) => s.settings.hiddenColumns);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const query = useMemo(() => {
    if (!search.trim() || !searchMod) return null;
    const q = searchMod.parseSearch(search, {
      today: todayISO(),
      fyStart,
      categories,
      projects,
      people: names,
    });
    return searchMod.isEmptySearch(q) ? null : q;
  }, [search, searchMod, fyStart, categories, projects, names]);
  const warrantyCount = useMemo(
    () => everything.filter((t) => t.warrantyMonths).length,
    [everything],
  );
  const filtered = useMemo(
    () =>
      sortTransactions(
        applyFilters(transactions, filters).filter(
          (t) => !query || !searchMod || searchMod.searchMatches(t, query),
        ),
        sort,
      ),
    [transactions, filters, sort, query, searchMod],
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

  const toggleOne = (id: string, range = false) => {
    const from = lastToggled.current;
    lastToggled.current = id;
    setSelected((s) => {
      const next = new Set(s);
      const on = !next.has(id);
      // Shift: everything between the last row chosen and this one takes this row's new state.
      const order = visible.map((t) => t.id);
      const a = from ? order.indexOf(from) : -1;
      const b = order.indexOf(id);
      const ids =
        range && a >= 0 && b >= 0 ? order.slice(Math.min(a, b), Math.max(a, b) + 1) : [id];
      for (const x of ids) {
        if (on) next.add(x);
        else next.delete(x);
      }
      return next;
    });
  };

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
          <h2>{tl('Nothing logged yet')}</h2>
          <p className="muted">{tl('Every expense you add shows up here, newest first.')}</p>
          <div className="btn-row empty-actions">
            <LoadSampleButton />
          </div>
        </section>
        {trashCount > 0 && (
          <p>
            <a href={href('/transactions?view=trash')}>{tl('Trash ({0})', trashCount)}</a>
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <QuickAdd />
      <SearchBox
        initial={initialSearch}
        onChange={(text) => {
          if (text.trim()) loadSearch();
          setSearch(text);
          setPage(1);
        }}
      />
      {query && <SearchChips q={query} />}
      <div className="toolbar">
        <button
          type="button"
          className="btn"
          aria-expanded={filtersOpen}
          aria-controls="filter-panel"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <Icon name="filter" />
          {activeFilters > 0 ? tl('Filters ({0})', activeFilters) : tl('Filters')}
        </button>
        <label className="visually-hidden" htmlFor="sort-select">
          {tl('Sort')}
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
          {tl('Group')}
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
          label={tl('Export CSV')}
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
        <ColumnsMenu />
        {warrantyCount > 0 && (
          <a className="btn btn-ghost" href={href('/transactions?view=warranties')}>
            {tl('Warranties ({0})', warrantyCount)}
          </a>
        )}
        <a className="btn btn-ghost" href={href('/transactions?view=trash')}>
          {trashCount > 0 ? tl('Trash ({0})', trashCount) : tl('Trash')}
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
          <h2>{tl('No matches')}</h2>
          <p className="muted">
            {query
              ? tl('Nothing fits this search and these filters.')
              : tl('Nothing fits these filters.')}
          </p>
          <p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                changeFilters(EMPTY_FILTERS);
                setPanelKey((k) => k + 1);
              }}
            >
              {tl('Clear filters')}
            </button>
          </p>
        </section>
      ) : (
        <section
          className="card marquee-area"
          aria-label={tl('All transactions')}
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
            {tl('Select all on this page')}
          </label>
          {groups.map((g) => (
            <div key={g.key} className="tx-group">
              {groupBy !== 'none' && (
                <h3 className="group-head">
                  {groupBy === 'merchant' && g.key !== '(none)' ? (
                    <a href={href(`/merchant?key=${encodeURIComponent(g.key)}`)}>{g.label}</a>
                  ) : (
                    <span>{g.label}</span>
                  )}
                  <Money minor={g.totalMinor} currency={currency} />
                </h3>
              )}
              <TxList
                label={g.label || tl('Transactions')}
                transactions={g.items}
                onDelete={(id) => void removeTransaction(id)}
                onEdit={setEditingId}
                onReceipt={setReceiptId}
                selected={shownSelected}
                onToggle={toggleOne}
                editingId={editingId}
                hidden={hiddenColumns}
              />
            </div>
          ))}
          {pages > 1 && (
            <nav className="pager" aria-label={tl('Pages')}>
              <button
                type="button"
                className="btn"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                {tl('Previous')}
              </button>
              <span className="muted small">{tl('Page {0} of {1}', current, pages)}</span>
              <button
                type="button"
                className="btn"
                disabled={current >= pages}
                onClick={() => setPage(current + 1)}
              >
                {tl('Next')}
              </button>
            </nav>
          )}
          <div className="tx-footer" data-testid="tx-footer">
            <span>
              {filtered.length === 1
                ? tl('1 transaction')
                : tl('{0} transactions', filtered.length)}
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
export function Transactions({
  view,
  initialFilters = EMPTY_FILTERS,
  initialSearch = '',
}: {
  view?: string | null;
  initialFilters?: Filters;
  initialSearch?: string;
}) {
  if (view === 'trash') return <TrashView />;
  if (view === 'warranties')
    return (
      <Suspense
        fallback={
          <p className="muted page-loading" aria-busy="true">
            {tl('Opening…')}
          </p>
        }
      >
        <WarrantiesView />
      </Suspense>
    );
  const current = view === 'calendar' || view === 'review' ? view : 'list';
  return (
    <>
      <ViewTabs current={current} />
      <Suspense
        fallback={
          <p className="muted page-loading" aria-busy="true">
            {tl('Opening…')}
          </p>
        }
      >
        {current === 'calendar' && <CalendarView />}
        {current === 'review' && <ReviewView />}
      </Suspense>
      {current === 'list' && (
        <Ledger initialFilters={initialFilters} initialSearch={initialSearch} />
      )}
    </>
  );
}
