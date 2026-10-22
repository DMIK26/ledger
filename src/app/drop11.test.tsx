import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLedger, type EntryDraft } from '../data/store';
import { useUi } from '../kit/ui';
import { useView } from '../kit/view';
import { App } from './App';

const NOW = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026

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
  ] as const)
    await db.clear(store);
  await db.put('settings', [], 'settledSplits');
  await act(async () => {
    const s = useLedger.getState();
    await s.setSetting('privacy', false);
    await s.setSetting('addMode', 'form');
    await s.setSetting('dashboardOrder', []);
    await s.setSetting('dashboardHidden', []);
    await s.setSetting('hiddenColumns', []);
    await s.setSetting('recapsSeen', []);
    await s.setSetting('wryLines', false);
    useLedger.setState({
      transactions: [],
      rules: {},
      trash: [],
      budgets: [],
      recurring: [],
      udhaar: [],
      people: [],
      settledSplits: [],
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

describe('command palette', () => {
  it('opens with Ctrl+K, goes to a view, and finds a merchant', async () => {
    await seed({ merchant: 'Swiggy' }, { merchant: 'Swiggy', date: '2026-10-17' });
    await go('#/');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const box = await screen.findByRole('combobox', {
      name: 'Search pages, actions and merchants',
    });
    await userEvent.type(box, 'goals');
    expect(screen.getByRole('option', { name: /Goals and funds/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(window.location.hash).toBe('#/budgets?view=goals'));

    act(() => useUi.getState().setPalette(true));
    const again = await screen.findByRole('combobox');
    await userEvent.clear(again);
    await userEvent.type(again, 'swig');
    await userEvent.click(screen.getByRole('option', { name: /Entries from Swiggy \(2\)/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/transactions'));
    expect(useView.getState().pins).toEqual([{ kind: 'merchant', id: 'swiggy', label: 'Swiggy' }]);
  });
});

describe('calendar', () => {
  it('shows spending per day, moves with the arrow keys and lists a day', async () => {
    await seed(
      { merchant: 'Shawarma', date: '2026-10-18' },
      { merchant: 'Chai', amountMinor: 2_000, date: '2026-10-18' },
    );
    await go('#/transactions?view=calendar');
    const day = await screen.findByTestId('cal-2026-10-18');
    expect(day).toHaveAccessibleName('18 Oct 2026, ₹520.00 spent');
    const today = screen.getByTestId('cal-2026-10-19');
    expect(today).toHaveAttribute('tabindex', '0');
    today.focus();
    fireEvent.keyDown(today, { key: 'ArrowLeft' });
    await waitFor(() => expect(day).toHaveFocus());
    fireEvent.click(day);
    const panel = screen.getByTestId('cal-day');
    expect(within(panel).getAllByTestId('tx-row')).toHaveLength(2);
    await userEvent.click(within(panel).getByRole('button', { name: 'Add for this day' }));
    expect(window.location.hash).toBe('#/transactions?view=calendar&action=add&on=2026-10-18');
  });
});

describe('review', () => {
  it('accepts with the right arrow and moves with a number key, learning as it goes', async () => {
    await seed(
      { merchant: 'Xyzcorp', categoryId: 'other' },
      { merchant: 'Qwerty', categoryId: 'other', date: '2026-10-17' },
    );
    await act(async () => {
      for (const t of useLedger.getState().transactions)
        await useLedger.getState().run({
          label: 'mark unsure',
          apply: async (db) => {
            await db.put('transactions', { ...t, unsure: true });
          },
          revert: async () => {},
        });
    });
    await go('#/transactions?view=review');
    expect(await screen.findByRole('link', { name: 'Review (2)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const card = await screen.findByTestId('review-card');
    expect(screen.getByTestId('review-left')).toHaveTextContent('2 to go');
    fireEvent.keyDown(card, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByTestId('review-left')).toHaveTextContent('1 to go'));
    // 4 is the fourth category: Shopping & Essentials.
    fireEvent.keyDown(screen.getByTestId('review-card'), { key: '4' });
    expect(await screen.findByTestId('review-done')).toHaveTextContent('Nothing to review');
    const rules = useLedger.getState().rules;
    expect(Object.values(rules).sort()).toEqual(['other', 'shopping']);
  });
});

describe('splitting an expense', () => {
  it('saves your share as spending and the rest as udhaar', async () => {
    await go('#/?action=add');
    const dialog = await screen.findByRole('dialog', { name: 'Add expense' });
    await userEvent.click(within(dialog).getByLabelText('Split with others'));
    await userEvent.type(within(dialog).getByLabelText('Whole bill'), '900');
    await userEvent.type(within(dialog).getByLabelText('What for'), 'Dinner');
    const split = await within(dialog).findByTestId('split');
    await userEvent.type(within(split).getByLabelText('Person 1'), 'Rahul');
    await userEvent.click(within(split).getByRole('button', { name: 'Add person' }));
    await userEvent.type(within(split).getByLabelText('Person 2'), 'Priya');
    expect(within(split).getByTestId('split-summary')).toHaveTextContent(
      'Your share, ₹300.00, is your spending; the others owe you theirs.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    expect(useLedger.getState().transactions[0]).toMatchObject({
      amountMinor: 30_000,
      merchant: 'Dinner',
    });
    expect(useLedger.getState().udhaar.map((u) => u.amountMinor)).toEqual([30_000, 30_000]);
    expect(
      useLedger
        .getState()
        .people.map((p) => p.name)
        .sort(),
    ).toEqual(['Priya', 'Rahul']);
  });

  it('shows who pays whom and settles it', async () => {
    await act(async () => {
      await useLedger.getState().addEntry(
        draft({
          amountMinor: 60_000,
          split: {
            mode: 'equal',
            paidBy: null,
            parts: [
              { personId: null, value: 0 },
              { personName: 'Rahul', value: 0 },
            ],
          },
        }),
      );
    });
    await go('#/money?view=udhaar');
    const card = await screen.findByTestId('splits');
    expect(within(card).getByTestId('transfer')).toHaveTextContent('Rahul pays You₹300.00');
    await userEvent.click(within(card).getByRole('button', { name: 'Mark all settled' }));
    await waitFor(() => expect(screen.queryByTestId('splits')).toBeNull());
    expect(screen.getByTestId('owed-to-you')).toHaveTextContent('₹0.00');
  });
});

describe('transaction rows', () => {
  it('hides columns and selects a range with Shift', async () => {
    await seed(
      { merchant: 'A', date: '2026-10-18' },
      { merchant: 'B', date: '2026-10-17' },
      { merchant: 'C', date: '2026-10-16' },
      { merchant: 'D', date: '2026-10-15' },
    );
    const user = userEvent.setup();
    await go('#/transactions');
    await user.click(screen.getByText('Columns'));
    await user.click(screen.getByLabelText('Method'));
    await waitFor(() => expect(useLedger.getState().settings.hiddenColumns).toEqual(['method']));
    expect(screen.getByRole('list', { name: 'Transactions' })).toHaveAttribute(
      'data-hide',
      'method',
    );
    await user.click(screen.getByLabelText('Select A on 18 Oct 2026'));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByLabelText('Select C on 16 Oct 2026'));
    await user.keyboard('{/Shift}');
    expect(screen.getByLabelText('Select B on 17 Oct 2026')).toBeChecked();
    expect(screen.getByLabelText('Select D on 15 Oct 2026')).not.toBeChecked();
  });

  it('shows an entry’s history in its edit form', async () => {
    await seed({ merchant: 'Chai', amountMinor: 2_000 });
    await act(async () => {
      const t = useLedger.getState().transactions[0]!;
      await useLedger
        .getState()
        .editTransaction(t.id, draft({ merchant: 'Chai', amountMinor: 2_500 }));
    });
    await go('#/transactions');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Chai on 18 Oct 2026' }));
    await userEvent.click(within(screen.getByTestId('tx-edit')).getByText('History'));
    const list = await screen.findByTestId('entry-history');
    expect(list).toHaveTextContent('Edited Chai');
    expect(list).toHaveTextContent('Added Chai');
  });
});

describe('the Dashboard', () => {
  it('scrubs day by day with the keyboard, and the donut follows', async () => {
    await seed(
      { merchant: 'Rent', amountMinor: 1_000_000, categoryId: 'housing', date: '2026-10-01' },
      { date: '2026-10-18' },
    );
    await go('#/');
    const scrub = await screen.findByTestId('scrub');
    expect(screen.getByTestId('scrub-label')).toHaveTextContent('So far: ₹10,500.00');
    scrub.focus();
    fireEvent.keyDown(scrub, { key: 'Home' });
    expect(screen.getByTestId('scrub-label')).toHaveTextContent('By 1 Oct 2026: ₹10,000.00');
    expect(scrub).toHaveAttribute(
      'aria-valuetext',
      '1 Oct 2026: ₹10,000.00 so far, ₹10,000.00 that day',
    );
    expect(within(screen.getByTestId('day-by-day')).getAllByTestId('tx-row')).toHaveLength(1);
    expect(
      screen.getByRole('group', { name: /Spending by category, By 1 Oct/ }),
    ).toBeInTheDocument();
    fireEvent.keyDown(scrub, { key: 'Escape' });
    expect(screen.getByTestId('scrub-label')).toHaveTextContent('So far');
  });

  it('can be customised: cards move and hide', async () => {
    await seed({ date: '2026-10-18' });
    await go('#/');
    await userEvent.click(await screen.findByRole('button', { name: 'Customise the Dashboard' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move Recent entries up' }));
    await waitFor(() =>
      expect(useLedger.getState().settings.dashboardOrder.slice(-2)).toEqual([
        'recent',
        'sketchbook',
      ]),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show Sketchbook' }));
    await waitFor(() =>
      expect(useLedger.getState().settings.dashboardHidden).toEqual(['sketchbook']),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('sketchbook')).toBeNull();
  });

  it('offers a recap once; the month recap starts with a guess', async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 9, 0, 0)); // Tue 3 Nov 2026
    await seed(
      { merchant: 'Rent', amountMinor: 1_500_000, categoryId: 'housing', date: '2026-10-01' },
      { date: '2026-10-18' },
      { date: '2026-10-28' },
    );
    await go('#/');
    const offer = await screen.findByTestId('recap-offer');
    expect(offer).toHaveTextContent('October 2026, in a few cards');
    await userEvent.click(within(offer).getByRole('button', { name: 'Open the recap' }));
    const dialog = await screen.findByRole('dialog', { name: 'October 2026' });
    expect(within(dialog).getByTestId('recap-guess')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Your guess'), { target: { value: '1500000' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show me' }));
    const card = within(dialog).getByTestId('recap-card');
    expect(card).toHaveTextContent('₹16,000.00');
    expect(within(dialog).getByTestId('recap-guess-result')).toHaveTextContent(
      'You guessed ₹15,000.00. Close. Off by 6%.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByTestId('recap-card')).toHaveTextContent(
      'Housing & Utilities took the most',
    );
    expect(useLedger.getState().settings.recapsSeen).toEqual(['month:2026-10']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    // The month recap is put away; last week's is offered next.
    expect(await screen.findByTestId('recap-offer')).toHaveTextContent('Your week, in a few cards');
  });
});

describe('reports', () => {
  it('compares with the 12-month average and opens a category in the treemap', async () => {
    await seed(
      { merchant: 'Swiggy', amountMinor: 200_000, date: '2026-10-05' },
      { merchant: 'Zomato', amountMinor: 100_000, date: '2026-10-06' },
      { merchant: 'Rent', amountMinor: 1_500_000, categoryId: 'housing', date: '2026-10-01' },
    );
    await go('#/reports');
    await userEvent.click(await screen.findByRole('button', { name: '12-month average' }));
    expect(screen.getByTestId('report-compare')).toHaveTextContent(
      'Nothing to compare with in 1 Oct 2025 to 30 Sep 2026.',
    );
    const legend = screen.getByRole('list', { name: 'Categories' });
    await userEvent.click(within(legend).getByRole('button', { name: /Food & Dining/ }));
    expect(screen.getByRole('heading', { name: 'Food & Dining, by merchant' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Merchants' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Swiggy₹2,000.0067%', 'Zomato₹1,000.0033%']);
    await userEvent.click(screen.getByRole('button', { name: 'Back to all categories' }));
    const table = screen.getByRole('region', { name: 'Money flow as a table' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });
});

describe('settings', () => {
  it('turns the wry one-liners on', async () => {
    await go('#/settings');
    await userEvent.click(screen.getByRole('switch', { name: 'Wry one-liners' }));
    await waitFor(() => expect(useLedger.getState().settings.wryLines).toBe(true));
  });
});

describe('recap images', () => {
  it('leave every amount out of the text used with privacy on', async () => {
    const { recapSlides } = await import('./recap/RecapViewer');
    const { buildRecap, lastMonth } = await import('../domain/recap');
    const r = buildRecap(
      lastMonth('2026-11-03'),
      [
        { date: '2026-10-01', amountMinor: 1_234_567, categoryId: 'housing', merchant: 'Rent' },
        { date: '2026-10-05', amountMinor: 76_543, categoryId: 'food', merchant: 'Swiggy' },
      ],
      [{ kind: 'income', date: '2026-10-01', amountMinor: 4_000_000 }],
      '2026-11-03',
    );
    const slides = recapSlides(r, () => 'Category', 'INR');
    expect(slides.length).toBeGreaterThan(4);
    for (const s of slides) {
      expect(s.heading).not.toMatch(/₹|\d\.\d\d/);
      expect(s.plain).not.toMatch(/₹|\d\.\d\d/);
    }
  });
});
