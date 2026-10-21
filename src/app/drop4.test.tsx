import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLedger, type EntryDraft } from '../data/store';
import { fmtMoney } from '../domain/money';
import { App } from './App';

const NOW = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  date: '2026-10-18',
  amountMinor: 50000,
  merchant: 'Shawarma',
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
  ...over,
});

const SEED: Array<Partial<EntryDraft>> = [
  {
    date: '2026-10-01',
    amountMinor: 800000,
    merchant: 'Rent',
    categoryId: 'housing',
    method: 'Bank transfer',
  },
  {
    date: '2026-10-05',
    amountMinor: 64900,
    merchant: 'Netflix',
    categoryId: 'entertainment',
    method: 'Card',
  },
  { date: '2026-10-12', amountMinor: 50000 },
  {
    date: '2026-09-01',
    amountMinor: 800000,
    merchant: 'Rent',
    categoryId: 'housing',
    method: 'Bank transfer',
  },
  {
    date: '2026-09-05',
    amountMinor: 64900,
    merchant: 'Netflix',
    categoryId: 'entertainment',
    method: 'Card',
  },
  {
    date: '2026-08-05',
    amountMinor: 64900,
    merchant: 'Netflix',
    categoryId: 'entertainment',
    method: 'Card',
  },
  {
    date: '2026-08-01',
    amountMinor: 800000,
    merchant: 'Rent',
    categoryId: 'housing',
    method: 'Bank transfer',
  },
  { date: '2026-03-31', amountMinor: 10000, merchant: 'March chai' },
  { date: '2026-04-01', amountMinor: 20000, merchant: 'April chai' },
];

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
    'categories',
  ] as const)
    await db.clear(store);
  await db.delete('settings', 'recurringIgnored');
  const { DEFAULT_CATEGORIES } = await import('../domain/categories');
  for (const c of DEFAULT_CATEGORIES) await db.put('categories', c);
  await act(async () => {
    await useLedger.getState().setSetting('privacy', false);
    useLedger.setState({
      transactions: [],
      rules: {},
      trash: [],
      budgets: [],
      recurring: [],
      recurringIgnored: [],
      notice: null,
    });
    for (const d of SEED) await useLedger.getState().addEntry(draft(d));
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

describe('reports', () => {
  it('shows the month so far against the same days last month', async () => {
    window.location.hash = '#/reports';
    render(<App />);
    expect(await screen.findByTestId('report-total')).toHaveTextContent(fmtMoney(914900));
    expect(screen.getByTestId('report-compare')).toHaveTextContent('1 Sep 2026 to 19 Sep 2026');
    expect(screen.getByTestId('report-compare')).toHaveTextContent(
      'comparing the same number of days so far',
    );
    expect(
      within(screen.getByTestId('report-row-housing')).getAllByText(fmtMoney(800000)),
    ).toHaveLength(2);
    expect(
      screen.getByRole('img', { name: '12 Oct 2026, ' + fmtMoney(50000) }),
    ).toBeInTheDocument();
  });

  it('splits the financial year at 1 April', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/reports';
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Financial year' }));
    expect(screen.getByText('FY 2026-27', { selector: '.period-label' })).toBeInTheDocument();
    expect(screen.queryByText('March chai')).toBeNull();
    expect(screen.getByText('April chai')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('FY 2025-26', { selector: '.period-label' })).toBeInTheDocument();
    expect(screen.getByTestId('report-total')).toHaveTextContent(fmtMoney(10000));
  });
});

describe('recurring', () => {
  it('finds a subscription, adds it, and shows the yearly saving if switched off', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/recurring';
    render(<App />);
    const found = await screen.findByTestId('candidate-netflix');
    expect(found).toHaveTextContent('Every month, seen 3 times');
    await user.click(within(found).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(useLedger.getState().recurring).toHaveLength(1));
    expect(useLedger.getState().recurring[0]).toMatchObject({
      merchant: 'Netflix',
      anchor: '2026-11-05',
    });
    await user.click(screen.getByRole('switch', { name: 'What if I switched off Netflix' }));
    expect(screen.getByTestId('rec-saving')).toHaveTextContent(`saves ${fmtMoney(778800)} a year`);
  });

  it('moves a payment with the arrow keys on its timeline pill', async () => {
    await act(async () => {
      await useLedger.getState().saveRecurring({
        id: 'gym',
        merchant: 'Gym',
        categoryId: 'health',
        method: 'UPI',
        amountMinor: 120000,
        cadence: 'monthly',
        anchor: '2026-10-25',
        createdAt: 1,
      });
    });
    window.location.hash = '#/recurring';
    render(<App />);
    const pill = await screen.findByTestId('pill-gym');
    expect(pill).toHaveAccessibleName(expect.stringContaining('25 Oct 2026'));
    fireEvent.keyDown(pill, { key: 'ArrowRight' });
    await waitFor(() => expect(useLedger.getState().recurring[0]?.anchor).toBe('2026-10-26'));
  });

  it('stops suggesting a merchant marked not recurring', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/recurring';
    render(<App />);
    await user.click(
      within(await screen.findByTestId('candidate-rent')).getByRole('button', {
        name: 'Not recurring',
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('candidate-rent')).toBeNull());
  });
});

describe('dashboard insights', () => {
  it('lists at most four plain observations', async () => {
    await act(async () => {
      await useLedger.getState().setMonthBudgets('2026-10', { overall: 1_000_000, categories: {} });
    });
    window.location.hash = '#/';
    render(<App />);
    const list = await screen.findByTestId('insights');
    expect(list.querySelectorAll('li').length).toBeGreaterThan(0);
    expect(list.querySelectorAll('li').length).toBeLessThanOrEqual(4);
    expect(list).toHaveTextContent('At this pace the month ends at');
  });
});

describe('settings', () => {
  it('adds a category, then deletes it by moving its entries', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/settings';
    render(<App />);
    await user.type(await screen.findByLabelText('New category name'), 'Pets{Enter}');
    await waitFor(() =>
      expect(useLedger.getState().categories.some((c) => c.name === 'Pets')).toBe(true),
    );
    const pets = useLedger.getState().categories.find((c) => c.name === 'Pets')!;
    await act(async () => {
      await useLedger.getState().addEntry(draft({ merchant: 'Vet', categoryId: pets.id }));
    });
    const row = screen.getByTestId(`cat-${pets.id}`);
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await user.selectOptions(within(row).getByLabelText(/Move its entry/), 'health');
    await user.click(within(row).getByRole('button', { name: 'Delete Pets' }));
    await waitFor(() =>
      expect(useLedger.getState().categories.some((c) => c.id === pets.id)).toBe(false),
    );
    expect(useLedger.getState().transactions.find((t) => t.merchant === 'Vet')?.categoryId).toBe(
      'health',
    );
  });

  it('keeps default names fixed and reorders with the keyboard', async () => {
    window.location.hash = '#/settings';
    render(<App />);
    const row = await screen.findByTestId('cat-food');
    expect(within(row).queryByRole('textbox')).toBeNull();
    fireEvent.keyDown(within(row).getByRole('button', { name: /Move Food & Dining/ }), {
      key: 'ArrowUp',
    });
    await waitFor(() => expect(useLedger.getState().categories[0]?.id).toBe('food'));
  });

  it('imports a CSV after showing what will be added, skipping duplicates', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/settings';
    render(<App />);
    const csv =
      'Txn Date,Narration,Withdrawal Amt\n12/10/2026,Shawarma,500\n13/10/2026,Plants,"1,250.00"\n14/10/2026,Salary,-90000\n';
    const input = (await screen.findByText('Choose a CSV file')).querySelector('input')!;
    await user.upload(input, new File([csv], 'bank.csv', { type: 'text/csv' }));
    const summary = await screen.findByTestId('csv-summary');
    expect(summary).toHaveTextContent(
      'Ready to add 1 entry. 1 already in Ledger is skipped. 1 row looks like money coming in',
    );
    await user.click(
      within(screen.getByTestId('csv-import')).getByRole('button', { name: 'Import' }),
    );
    await waitFor(() =>
      expect(
        useLedger.getState().transactions.find((t) => t.merchant === 'Plants')?.amountMinor,
      ).toBe(125000),
    );
  });

  it('shows the activity log', async () => {
    window.location.hash = '#/settings?view=activity';
    render(<App />);
    const log = await screen.findByTestId('activity');
    expect(log).toHaveTextContent('Added Rent');
  });
});

describe('privacy on the new pages', () => {
  it.each(['#/reports', '#/recurring'])('%s shows no real amount', async (hash) => {
    await act(async () => {
      await useLedger.getState().saveRecurring({
        id: 'gym',
        merchant: 'Gym',
        categoryId: 'health',
        method: 'UPI',
        amountMinor: 123456,
        cadence: 'monthly',
        anchor: '2026-10-25',
        createdAt: 1,
      });
      await useLedger.getState().setSetting('privacy', true);
    });
    window.location.hash = hash;
    render(<App />);
    await screen.findByRole('heading', { level: 1 });
    const attrs = [...document.querySelectorAll('*')]
      .flatMap((el) => [...el.attributes].map((a) => a.value))
      .join(' ');
    const all = `${document.body.textContent} ${attrs} ${document.title}`;
    for (const real of ['8,000.00', '649.00', '1,234.56', '9,149.00', '7,788.00', '500.00'])
      expect(all, real).not.toContain(real);
  });
});
