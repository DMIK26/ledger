import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLedger, type EntryDraft } from '../data/store';
import { fmtMoney } from '../domain/money';
import { initEntityBus, setHighlight } from '../kit/entityBus';
import { useView } from '../kit/view';
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
  { date: '2026-10-12', amountMinor: 50000 },
  { date: '2026-10-15', amountMinor: 35000, merchant: 'Swiggy' },
  {
    date: '2026-10-16',
    amountMinor: 24000,
    merchant: 'Uber',
    categoryId: 'transport',
    method: 'Card',
  },
  { date: '2026-09-12', amountMinor: 40000, merchant: 'Swiggy' },
  {
    date: '2026-09-02',
    amountMinor: 800000,
    merchant: 'Rent',
    categoryId: 'housing',
    method: 'Bank transfer',
  },
];

let stopBus: () => void = () => undefined;
beforeAll(async () => {
  await useLedger.getState().init();
  stopBus = initEntityBus();
});
afterAll(() => stopBus());

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  const db = useLedger.getState().getDb();
  for (const store of ['transactions', 'rules', 'trash', 'budgets', 'recurring'] as const)
    await db.clear(store);
  useView.setState({ pins: [], month: null, announcement: '' });
  setHighlight(null);
  await new Promise((r) => setTimeout(r, 20));
  await act(async () => {
    await useLedger.getState().setSetting('privacy', false);
    useLedger.setState({
      transactions: [],
      rules: {},
      trash: [],
      budgets: [],
      recurring: [],
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

const go = async (hash: string) => {
  cleanup();
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
};

describe('pins', () => {
  it('a pinned category gives the same total on every page', async () => {
    await go('#/transactions');
    const row = screen.getAllByTestId('tx-row').find((r) => r.textContent?.includes('Swiggy'))!;
    await userEvent.setup().click(within(row).getByRole('button', { name: /Food & Dining/ }));
    const food = fmtMoney(85000); // October food: 500 + 350
    expect(screen.getByTestId('pin-bar')).toHaveTextContent('Food & Dining');
    expect(screen.getByTestId('live')).toHaveTextContent('Pinned Food & Dining');

    // Transactions lists every month, so narrow it to October with the filter, as the others are.
    await go('#/transactions?from=2026-10-01&to=2026-10-19');
    expect(screen.getByTestId('tx-footer')).toHaveTextContent(food);
    await go('#/');
    expect(screen.getByTestId('month-total')).toHaveTextContent(food);
    await go('#/reports');
    expect(screen.getByTestId('report-total')).toHaveTextContent(food);
    await go('#/budgets');
    expect(within(screen.getByTestId('budget-row-food')).getByText(/spent/)).toHaveTextContent(
      food,
    );
    expect(screen.queryByTestId('budget-row-housing')).toBeNull();
  });

  it('Escape removes the last pin and the bar clears', async () => {
    act(() => {
      useView.getState().togglePin({ kind: 'method', id: 'Card', label: 'Card' });
      useView.getState().togglePin({ kind: 'category', id: 'food', label: 'Food & Dining' });
    });
    await go('#/');
    expect(screen.getByTestId('pin-bar')).toHaveTextContent('Food & Dining');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByTestId('pin-bar')).not.toHaveTextContent('Food & Dining'),
    );
    expect(screen.getByTestId('pin-bar')).toHaveTextContent('Card');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('pin-bar')).toBeNull();
  });
});

describe('month switcher', () => {
  it('moves the dashboard to another month and back', async () => {
    const user = userEvent.setup();
    await go('#/');
    expect(screen.getByTestId('month-total')).toHaveTextContent(fmtMoney(909000));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByTestId('month-switcher')).toHaveTextContent('September 2026');
    expect(screen.getByTestId('month-total')).toHaveTextContent(fmtMoney(840000));
    await user.click(screen.getByTestId('month-switcher'));
    await user.click(screen.getByRole('button', { name: 'Back to this month' }));
    expect(screen.getByTestId('month-switcher')).toHaveTextContent('October 2026');
  });

  it('opens a month by clicking its bar', async () => {
    await go('#/');
    fireEvent.click(screen.getByTestId('bar-2026-09'));
    await waitFor(() =>
      expect(screen.getByTestId('month-switcher')).toHaveTextContent('September 2026'),
    );
  });
});

describe('drill-down', () => {
  it('goes category, merchant, entries and back with the breadcrumb', async () => {
    const user = userEvent.setup();
    await go('#/');
    fireEvent.click(screen.getByTestId('slice-food'));
    const panel = await screen.findByTestId('breakdown');
    await user.click(within(panel).getByRole('button', { name: /Swiggy/ }));
    expect(within(panel).getByRole('navigation', { name: 'Breakdown' })).toHaveTextContent(
      'All categoriesFood & DiningSwiggy',
    );
    expect(panel).toHaveTextContent(`${fmtMoney(35000)} in 1 entry`);
    await user.click(
      within(within(panel).getByRole('navigation', { name: 'Breakdown' })).getByRole('button', {
        name: 'Food & Dining',
      }),
    );
    expect(panel).toHaveTextContent(`${fmtMoney(85000)} in 2 entries`);
    await user.click(
      within(panel).getByRole('button', { name: 'Pin Food & Dining to every page' }),
    );
    expect(useView.getState().pins).toMatchObject([{ kind: 'category', id: 'food' }]);
  });

  it('opens a breakdown from a KPI card', async () => {
    const user = userEvent.setup();
    await go('#/');
    await user.click(screen.getByRole('button', { name: /Daily average/ }));
    const panel = screen.getByTestId('breakdown');
    expect(within(panel).getByRole('navigation', { name: 'Breakdown' })).toHaveTextContent(
      'All days',
    );
    expect(panel).toHaveTextContent('16 Oct 2026');
  });
});

describe('undo history chips', () => {
  it('undoes back to before a chosen change', async () => {
    const user = userEvent.setup();
    await go('#/');
    await user.click(screen.getByRole('button', { name: 'History' }));
    // Newest first: Rent (Sep), Swiggy (Sep), Uber, ... Picking Swiggy undoes it and the Rent after it.
    await user.click(screen.getAllByRole('button', { name: 'Added Swiggy' })[0]!);
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(4));
    expect(useLedger.getState().transactions.some((t) => t.date === '2026-09-12')).toBe(false);
    expect(screen.getByRole('button', { name: /^Redo/ })).toBeInTheDocument();
  });
});

describe('entity highlighting', () => {
  it('dims everything that is not the hovered category, and shows a hover card', async () => {
    vi.useRealTimers();
    await go('#/');
    const slice = screen.getByTestId('slice-food');
    fireEvent.pointerOver(slice, { pointerType: 'mouse', clientX: 10, clientY: 10 });
    await waitFor(() =>
      expect(document.querySelector('style[data-entity-bus]')?.textContent).toContain(
        '[data-entity]:not([data-entity~="category:food"])',
      ),
    );
    expect(document.documentElement.dataset.highlight).toBe('category:food');
    expect(await screen.findByTestId('hover-card')).toHaveTextContent('Food & Dining');
    fireEvent.pointerOver(document.body, { pointerType: 'mouse' });
    await waitFor(() => expect(document.documentElement.dataset.highlight).toBeUndefined());
  });
});

describe('navigation badges and settings', () => {
  it('shows a badge for categories over budget', async () => {
    await act(async () => {
      await useLedger
        .getState()
        .setMonthBudgets('2026-10', { overall: null, categories: { food: 50_000 } });
    });
    await go('#/');
    expect(screen.getByTestId('badge-budgets')).toHaveTextContent('1, 1 over budget');
  });

  it('applies the motion setting to the page', async () => {
    const user = userEvent.setup();
    await go('#/settings');
    await user.click(
      within(screen.getByRole('group', { name: 'Motion' })).getByRole('button', { name: 'Off' }),
    );
    await waitFor(() => expect(document.documentElement.dataset.motion).toBe('off'));
    await act(async () => {
      await useLedger.getState().setSetting('motion', 'full');
    });
  });
});

describe('marquee totals', () => {
  it('the bulk bar total equals the sum of the selected rows', async () => {
    const user = userEvent.setup();
    await go('#/transactions');
    await user.click(screen.getByLabelText('Select Rent on 1 Oct 2026'));
    await user.click(screen.getByLabelText('Select Uber on 16 Oct 2026'));
    expect(screen.getByTestId('bulk-total')).toHaveTextContent(`2 selected, ${fmtMoney(824000)}`);
  });
});
