import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { putRow } from '../data/commands';
import { useLedger, type EntryDraft } from '../data/store';
import { App } from './App';
import { MonthCloseCard } from './plan/MonthClose';

const NOW = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026, day 19 of 31
const MONTH = '2026-10';

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
    'goals',
    'wishlist',
    'assets',
    'notes',
  ] as const)
    await db.clear(store);
  await db.put('settings', [], 'closedMonths');
  await act(async () => {
    const s = useLedger.getState();
    await s.setSetting('privacy', false);
    useLedger.setState({
      transactions: [],
      rules: {},
      trash: [],
      budgets: [],
      recurring: [],
      goals: [],
      wishlist: [],
      assets: [],
      notes: [],
      closedMonths: [],
      notice: null,
    });
    for (const c of useLedger.getState().categories)
      if (c.budgetKind || c.rollover)
        await s.setCategoryPlan(c.id, { budgetKind: undefined, rollover: false });
  });
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

describe('safe to spend on the Dashboard', () => {
  it('shares the month’s budget over the days left and explains the sum', async () => {
    await seed(
      { date: '2026-10-01', amountMinor: 1_500_000, merchant: 'Rent', categoryId: 'housing' },
      { date: '2026-10-19', amountMinor: 2_000, merchant: 'Chai' },
    );
    await act(async () => {
      await useLedger.getState().setMonthBudgets(MONTH, { overall: 2_500_000, categories: {} });
    });
    await go('#/');
    // (25,000 - 15,000) / 13 days = 769.23, rounded down to 769; less 20 spent today.
    expect(await screen.findByTestId('safe-today')).toHaveTextContent('₹749.00');
    expect(screen.getByTestId('safe-line')).toHaveTextContent('₹769.00 a day, ₹20.00 spent today');
    await userEvent.click(screen.getByText('How it is worked out'));
    expect(screen.getByText('Left for 13 days, today included').nextSibling).toHaveTextContent(
      '₹10,000.00',
    );
  });

  it('says how to start without a budget or money in, and hides amounts in privacy mode', async () => {
    await seed({ date: '2026-10-18' });
    await go('#/');
    expect(await screen.findByTestId('safe-start')).toHaveTextContent('Set a monthly budget');
    cleanup();
    await act(async () => {
      await useLedger.getState().setMonthBudgets(MONTH, { overall: 2_500_000, categories: {} });
      await useLedger.getState().setSetting('privacy', true);
    });
    await go('#/');
    expect(await screen.findByTestId('safe-today')).toHaveTextContent('₹88,888.88');
    expect(screen.getByTestId('safe-line').textContent).not.toMatch(/769|20\.00/);
  });

  it('flags budgets to watch', async () => {
    await seed(
      { date: '2026-10-05', amountMinor: 250_000, merchant: 'Swiggy' },
      { date: '2026-10-08', amountMinor: 150_000, merchant: 'Shoes', categoryId: 'shopping' },
    );
    await act(async () => {
      await useLedger
        .getState()
        .setMonthBudgets(MONTH, {
          overall: null,
          categories: { food: 300_000, shopping: 100_000 },
        });
    });
    await go('#/');
    const watch = await screen.findByTestId('at-risk');
    const rows = within(watch).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(/^Shopping & Essentials\s*Over by ₹500\.00$/);
    expect(rows[1]).toHaveTextContent(/^Food & Dining\s*Heading for ₹4,078\.95 of ₹3,000\.00$/);
  });
});

describe('close the month', () => {
  it('reviews last month and closes it with a note, undoably', async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 9, 0, 0)); // 3 Nov 2026
    await seed(
      { date: '2026-10-01', amountMinor: 1_500_000, merchant: 'Rent', categoryId: 'housing' },
      { date: '2026-10-18', amountMinor: 50_000 },
    );
    await act(async () => {
      await useLedger.getState().setMonthBudgets(MONTH, { overall: 2_000_000, categories: {} });
    });
    render(<MonthCloseCard today="2026-11-03" />);
    const card = screen.getByTestId('month-close');
    expect(within(card).getByRole('heading', { name: 'Close October 2026' })).toBeInTheDocument();
    expect(within(card).getByTestId('close-spent')).toHaveTextContent('₹15,500.00');
    expect(card).toHaveTextContent('₹4,500.00 under');
    expect(card).toHaveTextContent('Housing & Utilities, ₹15,000.00');
    await userEvent.type(
      within(card).getByLabelText('A note for October (optional)'),
      'Good month',
    );
    await userEvent.click(within(card).getByRole('button', { name: 'Close October' }));
    await waitFor(() => expect(screen.queryByTestId('month-close')).toBeNull());
    expect(useLedger.getState().closedMonths).toEqual(['2026-10']);
    expect(useLedger.getState().notes[0]).toMatchObject({
      anchor: 'month:2026-10',
      text: 'Good month',
    });
    await act(async () => {
      await useLedger.getState().undo();
    });
    expect(await screen.findByTestId('month-close')).toBeInTheDocument();
  });
});

describe('the Budgets page', () => {
  it('groups categories by type, changes a type and turns on rollover', async () => {
    await act(async () => {
      await useLedger
        .getState()
        .setMonthBudgets('2026-09', { overall: null, categories: { food: 300_000 } });
      await useLedger
        .getState()
        .setMonthBudgets(MONTH, { overall: null, categories: { food: 300_000 } });
    });
    await seed(
      { date: '2026-09-10', amountMinor: 220_000 },
      { date: '2026-10-18', amountMinor: 50_000 },
    );
    await go('#/budgets');
    const fixed = await screen.findByTestId('budget-group-fixed');
    expect(within(fixed).getByTestId('budget-row-housing')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('budget-group-non-monthly')).getByTestId('budget-row-education'),
    ).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Type of Groceries'), 'fixed');
    await waitFor(() =>
      expect(
        within(screen.getByTestId('budget-group-fixed')).getByTestId('budget-row-groceries'),
      ).toBeInTheDocument(),
    );
    const food = screen.getByTestId('budget-row-food');
    await userEvent.click(within(food).getByLabelText('Roll over'));
    expect(await within(food).findByTestId('budget-carry')).toHaveTextContent(
      'plus ₹800.00 carried',
    );
    // ₹3,000 + ₹800 carried, less ₹500 spent.
    expect(within(food).getByText(/left/)).toHaveTextContent('₹3,300.00 left');
    expect(screen.getByTestId('budget-subtotal-flexible')).toHaveTextContent(
      '₹500.00 of ₹3,800.00',
    );
  });

  it('shows the pace and resets the plan in one undoable step', async () => {
    await seed({
      date: '2026-10-02',
      amountMinor: 1_000_000,
      merchant: 'Laptop',
      categoryId: 'shopping',
    });
    await act(async () => {
      await useLedger
        .getState()
        .setMonthBudgets(MONTH, { overall: 3_100_000, categories: { food: 300_000 } });
    });
    await go('#/budgets');
    expect(await screen.findByTestId('pace-text')).toHaveTextContent(
      '₹10,000.00 spent by day 19. ₹9,000.00 below the straight line to ₹31,000.00.',
    );
    expect(screen.getByRole('img', { name: /spent by day 19/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset plan' }));
    await waitFor(() => expect(useLedger.getState().budgets).toHaveLength(0));
    expect(screen.getByTestId('proposal')).toBeInTheDocument();
    await act(async () => {
      await useLedger.getState().undo();
    });
    expect(useLedger.getState().budgets).toHaveLength(2);
  });
});

describe('goals', () => {
  it('adds a goal, works out the monthly amount and takes an amount', async () => {
    await go('#/budgets?view=goals');
    await userEvent.click(await screen.findByRole('button', { name: 'Add goal' }));
    await userEvent.type(screen.getByLabelText('Name'), 'New phone');
    await userEvent.type(screen.getByLabelText('Amount needed'), '24000');
    fireEvent.change(screen.getByLabelText('Needed by'), { target: { value: '2027-09-30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add goal' }));
    const goal = await screen.findByTestId('goal');
    // Oct 2026 to Sep 2027 is 12 months.
    expect(within(goal).getByTestId('goal-need')).toHaveTextContent(
      'Put aside ₹2,000.00 this month.',
    );
    expect(within(goal).getByTestId('goal-state')).toHaveTextContent('On track');
    await userEvent.click(within(goal).getByRole('button', { name: 'Put aside' }));
    await userEvent.type(within(goal).getByLabelText('Amount put aside'), '5000');
    await userEvent.click(within(goal).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(within(goal).getByTestId('goal-saved')).toHaveTextContent('₹5,000.00 of ₹24,000.00'),
    );
    expect(within(goal).getByTestId('goal-state')).toHaveTextContent('Ahead');
    await userEvent.click(within(goal).getByRole('button', { name: 'Snooze this month' }));
    expect(await within(goal).findByText(/Snoozed this month/)).toBeInTheDocument();
  });

  it('marks a yearly fund paid and starts it again', async () => {
    await act(async () => {
      const id = await useLedger.getState().saveGoal({
        name: 'Car insurance',
        kind: 'fund',
        targetMinor: 1_200_000,
        startDate: '2026-01-01',
        dueDate: '2026-12-01',
        yearly: true,
      });
      await useLedger.getState().addToGoal(id, 1_200_000, '2026-10-01');
    });
    await go('#/budgets?view=goals');
    const goal = await screen.findByTestId('goal');
    expect(within(goal).getByTestId('goal-state')).toHaveTextContent('Reached');
    await userEvent.click(within(goal).getByRole('button', { name: 'Paid' }));
    await waitFor(() => expect(goal).toHaveTextContent('needed by 1 Dec 2027'));
    expect(goal).toHaveTextContent('Last paid 19 Oct 2026');
  });
});

describe('wishlist', () => {
  it('waits, then buys (logging the expense) or skips (counting the saving)', async () => {
    await go('#/budgets?view=wishlist');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to wishlist' }));
    await userEvent.type(screen.getByLabelText('What'), 'Headphones');
    await userEvent.type(screen.getByLabelText('Price'), '3000');
    await userEvent.click(screen.getByRole('button', { name: 'Add to wishlist' }));
    const row = await screen.findByTestId('wish-row');
    expect(row).toHaveTextContent('7 more days to wait, until 26 Oct 2026');
    expect(within(row).queryByRole('button', { name: 'Buy' })).toBeNull();

    // Pretend it was added a month ago.
    const item = useLedger.getState().wishlist[0]!;
    await act(async () => {
      await useLedger
        .getState()
        .run(putRow('wishlist', { ...item, addedOn: '2026-09-01' }, item, 'Test'));
    });
    await userEvent.click(
      within(await screen.findByTestId('wish-row')).getByRole('button', { name: 'Buy' }),
    );
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    expect(useLedger.getState().transactions[0]).toMatchObject({
      merchant: 'Headphones',
      amountMinor: 300_000,
      date: '2026-10-19',
      source: 'wishlist',
    });
    expect(screen.getByTestId('wish-decided')).toHaveTextContent('Bought 19 Oct 2026');

    await act(async () => {
      await useLedger
        .getState()
        .saveWish({ name: 'Watch', priceMinor: 500_000, waitDays: 30, note: '' });
    });
    await userEvent.click(
      within(await screen.findByTestId('wish-row')).getByRole('button', {
        name: 'Changed my mind',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('saved-by-waiting')).toHaveTextContent(
        'Saved by waiting: ₹5,000.00 from 1 thing you skipped.',
      ),
    );
  });
});

describe('net worth', () => {
  it('adds an asset and counts it with accounts, less loans', async () => {
    await act(async () => {
      await useLedger.getState().saveAccount({
        name: 'HDFC',
        kind: 'bank',
        openingMinor: 1_000_000,
        openingDate: '2026-01-01',
        methods: [],
      });
    });
    await go('#/money');
    await userEvent.click(await screen.findByRole('button', { name: 'Add asset' }));
    const form = screen.getByRole('button', { name: 'Add asset' }).closest('form')!;
    await userEvent.type(within(form).getByLabelText('Name'), 'Gold coins');
    await userEvent.type(within(form).getByLabelText('Worth now'), '50000');
    await userEvent.click(within(form).getByRole('button', { name: 'Add asset' }));
    await waitFor(() =>
      expect(screen.getByTestId('networth-total')).toHaveTextContent('₹60,000.00'),
    );
    expect(screen.getByTestId('nw-assets')).toHaveTextContent('₹50,000.00');
    const row = screen.getByTestId('asset-row');
    await userEvent.click(within(row).getByRole('button', { name: 'Update value' }));
    const value = within(row).getByLabelText('Worth now');
    await userEvent.clear(value);
    await userEvent.type(value, '55000');
    await userEvent.click(within(row).getByRole('button', { name: 'Save value' }));
    await waitFor(() =>
      expect(screen.getByTestId('networth-total')).toHaveTextContent('₹65,000.00'),
    );
    for (const a of useLedger.getState().accounts)
      await act(async () => {
        await useLedger.getState().deleteAccount(a.id);
      });
  });
});
