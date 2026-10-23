import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLedger, type EntryDraft } from '../data/store';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { useUi } from '../kit/ui';
import { useView } from '../kit/view';
import { App } from './App';

const NOW = new Date(2026, 9, 22, 12, 0, 0); // Thu 22 Oct 2026

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  date: '2026-10-18',
  amountMinor: 50_000,
  merchant: 'Shawarma',
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
  ...over,
});

beforeAll(async () => {
  await useLedger.getState().init();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  const db = useLedger.getState().getDb();
  for (const store of [
    'transactions',
    'rules',
    'trash',
    'budgets',
    'recurring',
    'udhaar',
    'people',
    'projects',
    'flows',
    'categories',
  ] as const)
    await db.clear(store);
  for (const c of DEFAULT_CATEGORIES) await db.put('categories', c);
  for (const key of ['customRules', 'savedReports', 'nudgesDismissed'])
    await db.put('settings', [], key);
  await act(async () => {
    const s = useLedger.getState();
    await s.setSetting('privacy', false);
    await s.setSetting('addMode', 'form');
    await s.setSetting('dashboardOrder', []);
    await s.setSetting('dashboardHidden', []);
    await s.setSetting('recapsSeen', []);
    useLedger.setState({
      transactions: [],
      categories: DEFAULT_CATEGORIES,
      rules: {},
      trash: [],
      budgets: [],
      recurring: [],
      udhaar: [],
      people: [],
      flows: [],
      projects: [],
      customRules: [],
      savedReports: [],
      nudgesDismissed: [],
      notice: null,
    });
  });
  useUi.setState({ paletteOpen: false, recap: null, customising: false });
  useView.setState({ pins: [], month: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

const go = async (hash: string) => {
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
};

const seed = async (...entries: Array<Partial<EntryDraft>>) => {
  await act(async () => {
    for (const e of entries) await useLedger.getState().addEntry(draft(e));
  });
};

const rows = () => screen.queryAllByTestId('tx-row');

describe('plain-words search', () => {
  it('narrows the list and says what it understood', async () => {
    await seed(
      { merchant: 'Zomato', amountMinor: 60_000, date: '2026-09-12' },
      { merchant: 'Swiggy', amountMinor: 40_000, date: '2026-09-13' },
      { merchant: 'Dmart', amountMinor: 90_000, date: '2026-09-14', categoryId: 'groceries' },
      { merchant: 'Cafe', amountMinor: 80_000, date: '2026-09-15', method: 'Cash' },
      { merchant: 'Pizza', amountMinor: 70_000, date: '2026-10-01' },
    );
    await go('#/transactions');
    await userEvent.type(screen.getByLabelText('Search entries'), 'food last month over 500 upi');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Zomato');
    const chips = screen.getByTestId('search-chips');
    expect(chips).toHaveTextContent('Last month');
    expect(chips).toHaveTextContent('Over ₹500.00');
    expect(chips).toHaveTextContent('Food & Dining');
    expect(chips).toHaveTextContent('UPI');
    expect(screen.getByTestId('tx-footer')).toHaveTextContent('1 transaction');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(rows()).toHaveLength(5));
    // The typed amount never lands in an attribute.
    expect(screen.getByLabelText('Search entries').getAttribute('value')).toBeNull();
  });

  it('opens from the palette with the words typed there', async () => {
    await seed({ merchant: 'Zomato', notes: 'Birthday dinner' }, { merchant: 'Swiggy' });
    await go('#/');
    act(() => useUi.getState().setPalette(true));
    const box = await screen.findByRole('combobox');
    await userEvent.type(box, 'birthday');
    await userEvent.click(screen.getByRole('option', { name: /Search entries for “birthday”/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/transactions?q=birthday'));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Zomato');
  });
});

describe('merchant pages', () => {
  it('sum up a merchant and lead to a rule', async () => {
    await seed(
      { merchant: 'Swiggy', amountMinor: 30_000, date: '2026-10-20' },
      { merchant: 'Swiggy', amountMinor: 20_000, date: '2026-10-10' },
      { merchant: 'Swiggy', amountMinor: 10_000, date: '2026-09-30' },
      { merchant: 'Zomato', amountMinor: 99_000, date: '2026-10-11' },
    );
    await go('#/merchant?key=swiggy');
    const page = await screen.findByTestId('merchant-page');
    expect(within(page).getByRole('heading', { name: 'Swiggy' })).toBeInTheDocument();
    expect(screen.getByTestId('merchant-total')).toHaveTextContent('₹600.00');
    expect(page).toHaveTextContent('About every 10 days');
    expect(page).toHaveTextContent('Last visit20 Oct 2026, 2 days ago');
    expect(
      within(screen.getByRole('list', { name: 'Entries from Swiggy' })).getAllByTestId('tx-row'),
    ).toHaveLength(3);
    expect(within(page).getByRole('link', { name: 'Make a rule' })).toHaveAttribute(
      'href',
      '#/settings?view=rules&merchant=Swiggy',
    );
  });
});

describe('rules editor', () => {
  it('tests a rule on past entries and applies it when saved', async () => {
    await seed(
      { merchant: 'Amazon', categoryId: 'other', date: '2026-10-01' },
      { merchant: 'Amazon Pay', categoryId: 'shopping', date: '2026-10-02' },
      { merchant: 'Flipkart', categoryId: 'shopping', date: '2026-10-03' },
    );
    await go('#/settings?view=rules&merchant=Amazon');
    expect(screen.getByLabelText('These words')).toHaveValue('Amazon');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'shopping');
    await userEvent.type(screen.getByLabelText('Add a tag'), 'online');
    expect(screen.getByTestId('rule-test')).toHaveTextContent(
      'Matches 2 past entries; 2 would change.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(useLedger.getState().customRules).toHaveLength(1));
    const amazon = useLedger.getState().transactions.filter((t) => t.merchant.startsWith('Amazon'));
    expect(amazon.every((t) => t.categoryId === 'shopping' && t.tags.includes('online'))).toBe(
      true,
    );
    expect(screen.getByTestId('custom-rule')).toHaveTextContent(
      'Merchant contains “Amazon”: Shopping & Essentials, tag online',
    );
    expect(useLedger.getState().undoLabel).toBe('Added a rule for Amazon, changed 2 entries');
  });
});

describe('subcategories', () => {
  it('are added in Settings, picked in the form and opened in Reports', async () => {
    await go('#/settings');
    const food = await screen.findByTestId('cat-food');
    await userEvent.click(within(food).getByRole('button', { name: 'Subcategories' }));
    await userEvent.type(within(food).getByLabelText('New subcategory of Food & Dining'), 'Coffee');
    await userEvent.click(within(food).getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(
        within(food).getByRole('button', { name: /Subcategories \(1\): Coffee/ }),
      ).toBeInTheDocument(),
    );
    cleanup();

    await go('#/transactions?action=add');
    const sheet = await screen.findByRole('dialog', { name: 'Add expense' });
    await userEvent.type(within(sheet).getByLabelText('Amount'), '120');
    await userEvent.type(within(sheet).getByLabelText('What for'), 'Blue Tokai');
    await userEvent.selectOptions(within(sheet).getByLabelText('Category'), 'food');
    await userEvent.selectOptions(within(sheet).getByLabelText('Subcategory'), 'food/coffee');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(useLedger.getState().transactions[0]).toMatchObject({ subcategoryId: 'food/coffee' }),
    );
    await seed({ merchant: 'Thali', amountMinor: 30_000, date: '2026-10-21' });
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows().find((r) => r.textContent?.includes('Blue Tokai'))).toHaveTextContent('· Coffee');
    cleanup();

    await go('#/reports');
    await userEvent.click(await screen.findByRole('button', { name: 'Subcategories' }));
    const subRows = screen.getAllByTestId('report-sub-row');
    expect(subRows.map((r) => r.querySelector('th')?.textContent)).toEqual([
      'Coffee',
      'No subcategory',
    ]);
  });
});

describe('nudges and the weekly digest', () => {
  it('flag a likely repeat on the Dashboard; deleting the later one is one step', async () => {
    await seed(
      { merchant: 'Zomato', amountMinor: 42_000, date: '2026-10-19' },
      { merchant: 'Zomato', amountMinor: 42_000, date: '2026-10-20' },
      { merchant: 'Chai', amountMinor: 2_000, date: '2026-10-21' },
    );
    await go('#/');
    const card = await screen.findByTestId('nudges');
    expect(within(card).getByTestId('nudge-duplicate')).toHaveTextContent(
      'Two entries of ₹420.00 at Zomato on 19 Oct 2026 and 20 Oct 2026. One may be a repeat.',
    );
    await userEvent.click(within(card).getByRole('button', { name: 'Delete the later one' }));
    await waitFor(() => expect(screen.queryByTestId('nudges')).toBeNull());
    expect(useLedger.getState().transactions.filter((t) => t.merchant === 'Zomato')).toHaveLength(
      1,
    );
  });

  it('puts a nudge away for good with Fine', async () => {
    await seed(
      { merchant: 'Swiggy', amountMinor: 30_000, date: '2026-07-01' },
      { merchant: 'Swiggy', amountMinor: 40_000, date: '2026-08-01' },
      { merchant: 'Swiggy', amountMinor: 35_000, date: '2026-09-01' },
      { merchant: 'Swiggy', amountMinor: 120_000, date: '2026-10-20' },
    );
    await go('#/');
    const n = await screen.findByTestId('nudge-unusual');
    expect(n).toHaveTextContent(
      '₹1,200.00 at Swiggy on 20 Oct 2026 is about 3 times your usual ₹350.00.',
    );
    await userEvent.click(within(n).getByRole('button', { name: 'Fine' }));
    await waitFor(() => expect(screen.queryByTestId('nudges')).toBeNull());
    expect(useLedger.getState().nudgesDismissed).toHaveLength(1);
  });

  it('shows last week as a digest early in the week', async () => {
    vi.setSystemTime(new Date(2026, 9, 26, 9, 0, 0)); // Mon 26 Oct 2026
    await seed(
      { merchant: 'Rent', amountMinor: 1_500_000, categoryId: 'housing', date: '2026-10-19' },
      { merchant: 'Chai', amountMinor: 2_000, date: '2026-10-20' },
      { merchant: 'Chai', amountMinor: 2_000, date: '2026-10-13' },
    );
    await go('#/');
    const digest = await screen.findByTestId('week-digest');
    expect(digest).toHaveTextContent('Last week, 19 Oct 2026 to 25 Oct 2026');
    expect(digest).toHaveTextContent('Spent ₹15,020.00');
    expect(digest).toHaveTextContent('Most on Housing & Utilities: ₹15,000.00.');
    expect(digest).toHaveTextContent('5 days with nothing spent.');
    await userEvent.click(within(digest).getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByTestId('week-digest')).toBeNull());
    expect(useLedger.getState().settings.recapsSeen).toEqual(['week:2026-10-19']);
  });
});

describe('trips', () => {
  it('collect entries by date and add up against the budget', async () => {
    await go('#/budgets?view=trips');
    await userEvent.click(await screen.findByRole('button', { name: 'Add one' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Goa');
    fireEvent.change(screen.getByLabelText('First day (optional)'), {
      target: { value: '2026-10-15' },
    });
    fireEvent.change(screen.getByLabelText('Last day (optional)'), {
      target: { value: '2026-10-25' },
    });
    await userEvent.type(screen.getByLabelText('Budget (optional)'), '20000');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useLedger.getState().projects).toHaveLength(1));
    await seed(
      { merchant: 'Shacks', amountMinor: 150_000, date: '2026-10-17' },
      { merchant: 'Hotel', amountMinor: 500_000, date: '2026-10-16', categoryId: 'transport' },
      { merchant: 'Back home', amountMinor: 9_000, date: '2026-10-28' },
    );
    const card = await screen.findByTestId('project-card');
    await waitFor(() =>
      expect(within(card).getByTestId('project-spent')).toHaveTextContent('₹6,500.00'),
    );
    expect(card).toHaveTextContent(
      '2 entries, ₹812.50 a day over 8 days. ₹13,500.00 left of ₹20,000.00.',
    );
    await userEvent.click(within(card).getByRole('button', { name: 'Show entries' }));
    expect(within(card).getAllByTestId('tx-row')).toHaveLength(2);
  });
});

describe('Reports additions', () => {
  it('keeps a relative report, splits needs and wants, and totals tax and people', async () => {
    await seed(
      { merchant: 'Rent', amountMinor: 2_000_000, categoryId: 'housing', date: '2026-10-01' },
      { merchant: 'Dinners', amountMinor: 600_000, date: '2026-10-02', forWhom: 'Amma' },
      {
        merchant: 'Star Health',
        amountMinor: 2_000_000,
        categoryId: 'health',
        date: '2026-08-05',
        taxSection: '80D',
      },
      {
        merchant: 'LIC',
        amountMinor: 17_000_000,
        categoryId: 'other',
        date: '2026-06-05',
        taxSection: '80C',
      },
    );
    await act(async () => {
      await useLedger.getState().addIncome({
        date: '2026-10-01',
        amountMinor: 5_000_000,
        label: 'Salary',
        incomeKind: 'salary',
      });
    });
    await go('#/reports');
    await userEvent.click(await screen.findByRole('button', { name: 'Recent' }));
    await userEvent.selectOptions(screen.getByLabelText('Range'), 'Last 3 months');
    expect(screen.getByRole('heading', { name: 'Last 3 months' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save this report' }));
    await userEvent.type(screen.getByLabelText('Report name'), 'Quarter so far');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(useLedger.getState().savedReports[0]).toMatchObject({
        name: 'Quarter so far',
        range: { kind: 'relative', id: 'last-3-months' },
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Month' }));
    const nww = screen.getByTestId('fifty-thirty-twenty');
    expect(within(nww).getByTestId('nww-needs')).toHaveTextContent('₹20,000.0040%, aim 50%');
    expect(within(nww).getByTestId('nww-wants')).toHaveTextContent('₹6,000.0012%, aim 30%');
    expect(within(nww).getByTestId('nww-left')).toHaveTextContent('₹24,000.0048%, aim 20%');
    expect(screen.getByTestId('for-whom')).toHaveTextContent('Amma₹6,000.00');

    const tax = screen.getByTestId('tax-summary');
    expect(tax).toHaveTextContent('Tax deductions, FY 2026-27');
    expect(within(tax).getByTestId('tax-80C')).toHaveTextContent(
      '₹1,70,000.00₹1,50,000.00₹1,50,000.00 (₹20,000.00 over)',
    );
    expect(within(tax).getByTestId('tax-total')).toHaveTextContent(
      'Counts in all: ₹1,70,000.00 from 2 entries.',
    );

    // Saved reports come back as they were saved.
    await userEvent.selectOptions(screen.getByLabelText('Saved report'), 'Quarter so far');
    expect(screen.getByRole('heading', { name: 'Last 3 months' })).toBeInTheDocument();
  });
});

describe('warranties and privacy', () => {
  it('lists warranties from the toolbar, soonest first', async () => {
    await seed(
      { merchant: 'Mixer', date: '2026-09-01', warrantyMonths: 2, categoryId: 'shopping' },
      { merchant: 'Fridge', date: '2026-10-01', warrantyMonths: 24, categoryId: 'shopping' },
      { merchant: 'Chai', amountMinor: 2_000 },
    );
    await go('#/transactions');
    await userEvent.click(screen.getByRole('link', { name: 'Warranties (2)' }));
    await waitFor(() => expect(screen.getAllByTestId('warranty-row')).toHaveLength(2));
    const [first, second] = screen.getAllByTestId('warranty-row');
    expect(first).toHaveTextContent('Mixer');
    expect(first).toHaveTextContent('Ends on 1 Nov 2026, 10 days left');
    expect(first).toHaveTextContent('No receipt kept');
    expect(second).toHaveTextContent('Fridge');
  });

  it('hides every amount on the new screens with privacy on', async () => {
    await seed(
      {
        merchant: 'Swiggy',
        amountMinor: 123_456,
        date: '2026-10-20',
        forWhom: 'Amma',
        taxSection: '80C',
        warrantyMonths: 12,
      },
      { merchant: 'Swiggy', amountMinor: 123_456, date: '2026-10-21' },
    );
    await act(async () => {
      await useLedger.getState().saveProject({
        name: 'Goa',
        kind: 'trip',
        start: '2026-10-15',
        end: '2026-10-25',
        budgetMinor: 765_432,
        collect: true,
      });
      await useLedger.getState().setSetting('privacy', true);
    });
    for (const hash of [
      '#/merchant?key=swiggy',
      '#/budgets?view=trips',
      '#/transactions?view=warranties',
      '#/reports',
      '#/',
      '#/transactions?q=swiggy%20over%201000',
    ]) {
      await go(hash);
      await screen.findByRole('heading', { level: 1 });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      const text = document.body.textContent ?? '';
      expect(text, hash).not.toMatch(/1,234\.56|7,654\.32|2,469\.12|1,000\.00/);
      cleanup();
    }
  });
});
