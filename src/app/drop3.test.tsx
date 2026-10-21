import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLedger, type EntryDraft } from '../data/store';
import { budgetsForMonth } from '../domain/budgets';
import { fmtMoney } from '../domain/money';
import { App } from './App';

const NOW = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026
const MONTH = '2026-10';

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
  { date: '2026-10-01', amountMinor: 800000, merchant: 'Rent', categoryId: 'housing' },
  { date: '2026-10-18', amountMinor: 50000 },
  { date: '2026-10-18', amountMinor: 24000, merchant: 'Uber', categoryId: 'transport' },
  { date: '2026-10-10', amountMinor: 12000, merchant: 'Auto', categoryId: 'transport' },
  { date: '2026-10-25', amountMinor: 99900, merchant: 'Concert', categoryId: 'entertainment' }, // upcoming
  { date: '2026-09-05', amountMinor: 600000, merchant: 'Rent', categoryId: 'housing' },
  { date: '2026-09-12', amountMinor: 30000, merchant: 'Swiggy' },
  { date: '2026-08-05', amountMinor: 600000, merchant: 'Rent', categoryId: 'housing' },
  { date: '2026-07-05', amountMinor: 600000, merchant: 'Rent', categoryId: 'housing' },
];

beforeAll(async () => {
  await useLedger.getState().init();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  const db = useLedger.getState().getDb();
  for (const store of ['transactions', 'rules', 'trash', 'budgets'] as const) await db.clear(store);
  await act(async () => {
    await useLedger.getState().setSetting('privacy', false);
    useLedger.setState({ transactions: [], rules: {}, trash: [], budgets: [], notice: null });
    for (const d of SEED) await useLedger.getState().addEntry(draft(d));
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

const budgetsNow = () => budgetsForMonth(useLedger.getState().budgets, MONTH);

const setBudgets = async (overall: number | null, categories: Record<string, number> = {}) => {
  await act(async () => {
    await useLedger.getState().setMonthBudgets(MONTH, { overall, categories });
  });
};

describe('dashboard', () => {
  it('shows the four KPIs for the month so far', async () => {
    window.location.hash = '#/';
    render(<App />);
    // 8000 + 500 + 240 + 120; the upcoming concert is not spent yet.
    expect(await screen.findByTestId('month-total')).toHaveTextContent(fmtMoney(886000));
    // Against 1-19 Sep: 6000 + 300 = 6300 → 41% more.
    expect(screen.getByTestId('kpi-change')).toHaveTextContent('41% more');
    expect(screen.getByText('Housing & Utilities', { selector: '.kpi-name' })).toBeInTheDocument();
  });

  it('opens the category from a donut slice with the same total on Transactions', async () => {
    window.location.hash = '#/';
    render(<App />);
    const slice = await screen.findByTestId('slice-transport');
    expect(slice).toHaveAttribute(
      'aria-label',
      `Transport & Travel, ${fmtMoney(36000)}. Show entries`,
    );
    fireEvent.click(slice);
    await waitFor(() =>
      expect(window.location.hash).toContain('#/transactions?category=transport'),
    );
    expect(await screen.findByTestId('tx-footer')).toHaveTextContent(fmtMoney(36000));
    expect(screen.getByTestId('tx-footer')).toHaveTextContent('2 transactions');
  });

  it('moves the budget line in ₹500 steps with the keyboard', async () => {
    await setBudgets(1_000_000);
    window.location.hash = '#/';
    render(<App />);
    const line = await screen.findByTestId('budget-line');
    expect(line).toHaveAttribute('aria-valuetext', fmtMoney(1_000_000));
    fireEvent.keyDown(line, { key: 'ArrowUp' });
    await waitFor(() => expect(budgetsNow().overall).toBe(1_050_000));
    fireEvent.keyDown(screen.getByTestId('budget-line'), { key: 'PageDown' });
    await waitFor(() => expect(budgetsNow().overall).toBe(550_000));
    await act(async () => {
      await useLedger.getState().undo();
    });
    expect(budgetsNow().overall).toBe(1_050_000);
  });

  it('says over budget in words and answers what-if', async () => {
    await setBudgets(800_000);
    window.location.hash = '#/';
    render(<App />);
    expect(await screen.findByTestId('budget-left')).toHaveTextContent(
      `Over by ${fmtMoney(86000)}`,
    );
    fireEvent.change(screen.getByLabelText(/What if I spend/), { target: { value: '0' } });
    // Nothing more from tomorrow: the month ends where it is.
    expect(screen.getByTestId('what-if-result')).toHaveTextContent(
      `October 2026 ends at ${fmtMoney(886000)}, over by ${fmtMoney(86000)}`,
    );
  });

  it('offers last month’s budgets as a ghost to accept', async () => {
    await act(async () => {
      await useLedger.getState().setMonthBudgets('2026-09', { overall: 700_000, categories: {} });
    });
    const user = userEvent.setup();
    window.location.hash = '#/';
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(budgetsNow().overall).toBe(700_000));
  });
});

describe('budgets page', () => {
  it('suggests from three months as ghosts, then accepts', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/budgets';
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Suggest budgets' }));
    const proposal = screen.getByTestId('proposal');
    expect(
      within(screen.getByTestId('budget-row-housing')).getByText(/Suggested/),
    ).toHaveTextContent(fmtMoney(600_000));
    expect(budgetsNow().overall).toBeNull();
    await user.click(within(proposal).getByRole('button', { name: 'Accept' }));
    await waitFor(() =>
      expect(budgetsNow().categories).toEqual({ housing: 600_000, food: 50_000 }),
    );
    expect(budgetsNow().overall).toBe(650_000);
  });

  it('rejecting a suggestion changes nothing', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/budgets';
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Suggest budgets' }));
    await user.click(
      within(screen.getByTestId('proposal')).getByRole('button', { name: 'Reject' }),
    );
    expect(screen.queryByTestId('proposal')).toBeNull();
    expect(useLedger.getState().budgets).toHaveLength(0);
  });

  it('copies last month', async () => {
    await act(async () => {
      await useLedger
        .getState()
        .setMonthBudgets('2026-09', { overall: 900_000, categories: { housing: 600_000 } });
    });
    const user = userEvent.setup();
    window.location.hash = '#/budgets';
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Copy last month' }));
    await user.click(
      within(screen.getByTestId('proposal')).getByRole('button', { name: 'Accept' }),
    );
    await waitFor(() =>
      expect(budgetsNow()).toEqual({ overall: 900_000, categories: { housing: 600_000 } }),
    );
  });

  it('sets a category budget by typing and shows the status in words', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/budgets';
    render(<App />);
    const field = await screen.findByLabelText('Budget for Transport & Travel');
    await user.type(field, '300{Enter}');
    await waitFor(() => expect(budgetsNow().categories).toEqual({ transport: 30_000 }));
    expect(
      within(screen.getByTestId('budget-row-transport')).getByText(/Over by/),
    ).toHaveTextContent(`Over by ${fmtMoney(6_000)}`);
  });

  it('moves budget across a divider with the total unchanged', async () => {
    await setBudgets(2_000_000, { housing: 800_000, food: 300_000, transport: 200_000 });
    window.location.hash = '#/budgets';
    render(<App />);
    const divider = await screen.findByTestId('divider-0');
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(budgetsNow().categories).toEqual({
        housing: 850_000,
        food: 250_000,
        transport: 200_000,
      }),
    );
    const sum = Object.values(budgetsNow().categories).reduce((a, b) => a + b, 0);
    expect(sum).toBe(1_300_000);
  });
});

describe('privacy with charts and budgets', () => {
  it.each(['#/', '#/budgets'])('%s shows no real amount anywhere', async (hash) => {
    await setBudgets(1_234_500, { housing: 765_400 });
    await act(async () => {
      await useLedger.getState().setSetting('privacy', true);
    });
    window.location.hash = hash;
    render(<App />);
    await screen.findByRole('heading', { level: 1 });
    if (hash === '#/') {
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'By category' }));
      fireEvent.focus(screen.getByTestId('bar-2026-10'));
      fireEvent.focus(screen.getByTestId('slice-housing'));
    }
    const attrs = [...document.querySelectorAll('*')]
      .flatMap((el) => [...el.attributes].map((a) => a.value))
      .join(' ');
    const all = `${document.body.textContent} ${attrs} ${document.title}`;
    for (const real of ['12,345', '7,654', '8,860', '8,000', '360.00', '12345', '7654'])
      expect(all, real).not.toContain(real);
  });
});

describe('privacy switched on while the dashboard is open', () => {
  it('re-masks chart labels and the what-if slider', async () => {
    await setBudgets(1_234_500);
    window.location.hash = '#/';
    render(<App />);
    expect(await screen.findByTestId('slice-housing')).toHaveAttribute(
      'aria-label',
      expect.stringContaining(fmtMoney(800_000)),
    );
    await act(async () => {
      await useLedger.getState().setSetting('privacy', true);
    });
    const attrs = [...document.querySelectorAll('*')]
      .flatMap((el) => [...el.attributes].map((a) => a.value))
      .join(' ');
    for (const real of ['8,000.00', '12,345.00', '8,860.00'])
      expect(attrs, real).not.toContain(real);
  });
});
