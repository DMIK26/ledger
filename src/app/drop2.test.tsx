import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLedger, type EntryDraft } from '../data/store';
import { fmtMoney } from '../domain/money';
import { App } from './App';
import { QuickAdd } from './QuickAdd';
import { Transactions } from './pages/Transactions';

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

beforeAll(async () => {
  await useLedger.getState().init();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  const db = useLedger.getState().getDb();
  for (const store of ['transactions', 'rules', 'trash'] as const) await db.clear(store);
  await db.delete('settings', 'savedViews');
  await act(async () => {
    await useLedger.getState().setSetting('privacy', false);
    useLedger.setState({ transactions: [], rules: {}, trash: [], views: [], notice: null });
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

const seed = async (list: Array<Partial<EntryDraft>>) => {
  await act(async () => {
    for (const d of list) await useLedger.getState().addEntry(draft(d));
  });
};

describe('quick add, drop 2', () => {
  it('lets the method chip override the typed method', async () => {
    const user = userEvent.setup();
    render(<QuickAdd />);
    await user.type(screen.getByLabelText('Quick add'), 'taxi 340 upi');
    await user.selectOptions(screen.getByLabelText('Paid by'), 'Cash');
    await user.type(screen.getByLabelText('Quick add'), '{Enter}');
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    expect(useLedger.getState().transactions[0]?.method).toBe('Cash');
  });

  it('highlights recognised words', async () => {
    const user = userEvent.setup();
    const { container } = render(<QuickAdd />);
    await user.type(screen.getByLabelText('Quick add'), 'shawarma 500 upi');
    expect(container.querySelector('.qa-amount')).toHaveTextContent('500');
    expect(container.querySelector('.qa-method')).toHaveTextContent('upi');
    expect(container.querySelector('.qa-category')).toHaveTextContent('shawarma');
  });

  it('warns about a likely duplicate and saves only on the second Enter', async () => {
    await seed([{}]);
    const user = userEvent.setup();
    render(<QuickAdd />);
    await user.type(screen.getByLabelText('Quick add'), 'shawarma 500 on 18th oct{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('looks like a repeat of Shawarma');
    expect(useLedger.getState().transactions).toHaveLength(1);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(2));
  });
});

describe('add sheet', () => {
  it('fills the form from a description and saves with tags', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/transactions?action=add';
    render(<App />);
    const sheet = await screen.findByRole('dialog', { name: 'Add expense' });
    await user.type(within(sheet).getByLabelText('Describe it'), 'uber 240 yesterday card');
    expect(within(sheet).getByLabelText('What for')).toHaveValue('Uber');
    expect(within(sheet).getByLabelText('Category')).toHaveValue('transport');
    await user.type(within(sheet).getByLabelText('Tags'), 'work, Trip');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    expect(useLedger.getState().transactions[0]).toMatchObject({
      merchant: 'Uber',
      amountMinor: 24000,
      date: '2026-10-18',
      method: 'Card',
      tags: ['work', 'trip'],
    });
    await waitFor(() => expect(window.location.hash).toBe('#/transactions'));
  });

  it('refuses to save without an amount', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/?action=add';
    render(<App />);
    const sheet = await screen.findByRole('dialog', { name: 'Add expense' });
    await user.type(within(sheet).getByLabelText('What for'), 'Lunch');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Enter an amount above zero');
    expect(useLedger.getState().transactions).toHaveLength(0);
  });
});

describe('transactions page', () => {
  it('edits a row inline and undo restores it', async () => {
    await seed([{}]);
    const user = userEvent.setup();
    render(<Transactions />);
    await user.click(screen.getByRole('button', { name: 'Edit Shawarma on 18 Oct 2026' }));
    const form = screen.getByTestId('tx-edit');
    const amount = within(form).getByLabelText('Amount');
    await user.clear(amount);
    await user.type(amount, '650');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(useLedger.getState().transactions[0]?.amountMinor).toBe(65000));
    await act(async () => {
      await useLedger.getState().undo();
    });
    expect(useLedger.getState().transactions[0]?.amountMinor).toBe(50000);
  });

  it('filters by category with faceted counts, and shows No matches', async () => {
    await seed([
      {},
      { merchant: 'Uber', categoryId: 'transport', amountMinor: 24000, method: 'Card' },
    ]);
    const user = userEvent.setup();
    render(<Transactions />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const panel = screen.getByRole('region', { name: 'Filters' });
    const transport = within(panel).getByRole('button', { name: /Transport & Travel/ });
    expect(transport).toHaveTextContent('1');
    await user.click(transport);
    expect(screen.getAllByTestId('tx-row')).toHaveLength(1);
    expect(screen.getByTestId('tx-footer')).toHaveTextContent('1 transaction');
    expect(screen.getByTestId('tx-footer')).toHaveTextContent(fmtMoney(24000));
    await user.type(screen.getByLabelText('Amount at least'), '1000');
    expect(screen.getByRole('heading', { name: 'No matches' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(screen.getAllByTestId('tx-row')).toHaveLength(2);
  });

  it('pages 15 rows at a time with one footer row', async () => {
    await seed(
      Array.from({ length: 17 }, (_, i) => ({ merchant: `Item ${i}`, amountMinor: 100 * (i + 1) })),
    );
    const user = userEvent.setup();
    render(<Transactions />);
    expect(screen.getAllByTestId('tx-row')).toHaveLength(15);
    expect(screen.getAllByTestId('tx-footer')).toHaveLength(1);
    expect(screen.getByTestId('tx-footer')).toHaveTextContent('17 transactions');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByTestId('tx-row')).toHaveLength(2);
  });

  it('bulk-moves selected rows to a category', async () => {
    await seed([{ merchant: 'A' }, { merchant: 'B' }, { merchant: 'C' }]);
    const user = userEvent.setup();
    render(<Transactions />);
    await user.click(screen.getByLabelText('Select A on 18 Oct 2026'));
    await user.click(screen.getByLabelText('Select B on 18 Oct 2026'));
    expect(screen.getByTestId('bulk-total')).toHaveTextContent('2 selected');
    await user.selectOptions(screen.getByLabelText('Move selected to'), 'business');
    await waitFor(() =>
      expect(
        useLedger.getState().transactions.filter((t) => t.categoryId === 'business'),
      ).toHaveLength(2),
    );
  });

  it('groups by category with subtotals', async () => {
    await seed([{}, { merchant: 'Uber', categoryId: 'transport', amountMinor: 24000 }]);
    const user = userEvent.setup();
    render(<Transactions />);
    await user.selectOptions(screen.getByLabelText('Group'), 'category');
    expect(screen.getByRole('heading', { name: /Transport & Travel/ })).toHaveTextContent(
      fmtMoney(24000),
    );
  });

  it('saves a view and restores it later', async () => {
    await seed([{}, { merchant: 'Uber', categoryId: 'transport', amountMinor: 24000 }]);
    const user = userEvent.setup();
    render(<Transactions />);
    await user.selectOptions(screen.getByLabelText('Sort'), 'amount-asc');
    await user.click(screen.getByRole('button', { name: 'Save view' }));
    await user.type(screen.getByLabelText('View name'), 'Cheap first{Enter}');
    await waitFor(() =>
      expect(useLedger.getState().views.map((v) => v.name)).toEqual(['Cheap first']),
    );
    expect(useLedger.getState().views[0]?.sort).toEqual({ key: 'amount', dir: 'asc' });
  });

  it('deletes to trash and restores from the trash view', async () => {
    await seed([{}]);
    const user = userEvent.setup();
    const first = render(<Transactions />);
    await user.click(screen.getByRole('button', { name: 'Delete Shawarma on 18 Oct 2026' }));
    await waitFor(() => expect(useLedger.getState().trash).toHaveLength(1));
    first.unmount();
    render(<Transactions view="trash" />);
    expect(screen.getByText(/30 days left/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
  });
});

describe('privacy on every page', () => {
  const ROUTES = [
    '#/',
    '#/transactions',
    '#/transactions?view=trash',
    '#/budgets',
    '#/reports',
    '#/recurring',
    '#/settings',
    '#/transactions?action=add',
  ];

  it.each(ROUTES)('%s shows no real amount in text, attributes or title', async (hash) => {
    await seed([
      { amountMinor: 123456, tags: ['work'] },
      { merchant: 'Gone', amountMinor: 765432 },
    ]);
    await act(async () => {
      const gone = useLedger.getState().transactions.find((t) => t.merchant === 'Gone')!;
      await useLedger.getState().removeTransaction(gone.id);
      const { parseQuickEntry } = await import('../domain/parser');
      await useLedger
        .getState()
        .addFromParsed(parseQuickEntry('chai 4321.09 upi', { today: '2026-10-19' }));
      await useLedger.getState().setSetting('privacy', true);
    });
    window.location.hash = hash;
    render(<App />);
    await screen.findByRole('heading', { level: 1 });
    const user = userEvent.setup();
    if (hash === '#/transactions') {
      // Open an inline editor and a grouped view so their amounts are on the page too.
      await user.click(screen.getByRole('button', { name: /^Edit Shawarma/ }));
      await user.selectOptions(screen.getByLabelText('Group'), 'category');
    }
    const attrs = [...document.querySelectorAll('*')]
      .flatMap((el) => [...el.attributes].map((a) => a.value))
      .join(' ');
    const everything = `${document.body.textContent} ${attrs} ${document.title}`;
    for (const real of ['1,234.56', '1234.56', '7,654.32', '1,23,456', '4321.09', '4,321.09'])
      expect(everything).not.toContain(real);
  });
});

describe('screen lock and shortcuts', () => {
  it('shows nothing but the PIN screen while locked', async () => {
    await seed([{ amountMinor: 123456 }]);
    await act(async () => {
      await useLedger.getState().setPin('2468');
      useLedger.getState().lockNow();
    });
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Ledger is locked' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Shawarma');
    await user.type(screen.getByLabelText('Enter your PIN'), '1111{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('That PIN is not right');
    await user.type(screen.getByLabelText('Enter your PIN'), '2468{Enter}');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    await act(async () => {
      await useLedger.getState().removePin('2468');
    });
  }, 20_000);

  it('Forgot PIN starts a 24-hour wait without unlocking', async () => {
    await seed([{}]);
    await act(async () => {
      await useLedger.getState().setPin('2468');
      useLedger.getState().lockNow();
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Forgot PIN?' }));
    expect(screen.getByText(/Your entries, receipts and settings stay/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start the 24-hour wait' }));
    expect(await screen.findByTestId('pin-reset-pending')).toHaveTextContent('about 24 hours');
    expect(screen.getByRole('heading', { name: 'Ledger is locked' })).toBeInTheDocument();
    expect(useLedger.getState().lockReset).toBe(NOW.getTime());
    // The right PIN cancels the reset.
    await user.type(screen.getByLabelText('Enter your PIN'), '2468{Enter}');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(useLedger.getState().lockReset).toBeNull();
    await act(async () => {
      await useLedger.getState().removePin('2468');
    });
  }, 20_000);

  it('undoes with Ctrl+Z when no field has focus', async () => {
    await seed([{}]);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(0));
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
  });
});
