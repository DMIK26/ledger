import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLedger } from '../data/store';
import { fmtMoney } from '../domain/money';
import { App } from './App';
import { QuickAdd } from './QuickAdd';
import { parseHash } from './router';
import { Transactions } from './pages/Transactions';

const NOW = new Date(2026, 9, 19, 12, 0, 0); // Mon 19 Oct 2026, local time

beforeAll(async () => {
  await useLedger.getState().init();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  // Start every test from an empty ledger with privacy off.
  const db = useLedger.getState().getDb();
  await db.clear('transactions');
  await db.clear('rules');
  await act(async () => {
    await useLedger.getState().setSetting('privacy', false);
    // Mirror the cleared stores in memory so the UI starts empty.
    useLedger.setState({ transactions: [], rules: {}, notice: null });
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

describe('router', () => {
  it('splits path and query and falls back to the dashboard', () => {
    const r = parseHash('#/transactions?action=add');
    expect(r.path).toBe('/transactions');
    expect(r.query.get('action')).toBe('add');
    expect(parseHash('#/nowhere').path).toBe('/');
    expect(parseHash('').path).toBe('/');
  });
});

describe('quick add', () => {
  it('shows what it understood and saves "shawarma 500 on 18th oct upi" on 18 Oct', async () => {
    const user = userEvent.setup();
    render(<Transactions adding={false} />);
    const input = screen.getByLabelText('Quick add');
    await user.type(input, 'shawarma 500 on 18th oct upi');

    expect(screen.getByTestId('chip-amount')).toHaveTextContent('₹500.00');
    expect(screen.getByTestId('chip-date')).toHaveTextContent('Yesterday');
    expect(screen.getByLabelText('Category')).toHaveValue('food');
    expect(screen.getByTestId('chip-method')).toHaveTextContent('UPI');

    await user.keyboard('{Enter}');
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    expect(useLedger.getState().transactions[0]).toMatchObject({
      merchant: 'Shawarma',
      date: '2026-10-18',
      amountMinor: 50000,
      method: 'UPI',
    });
    expect(input).toHaveValue('');
    expect(await screen.findByTestId('tx-footer')).toHaveTextContent('1 transaction');
  });

  it('never saves an entry with an impossible date', async () => {
    const user = userEvent.setup();
    render(<QuickAdd />);
    await user.type(screen.getByLabelText('Quick add'), 'lunch 150 31 sep{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('September has 30 days');
    expect(useLedger.getState().transactions).toHaveLength(0);
  });

  it('asks for a category when unsure and Escape clears', async () => {
    const user = userEvent.setup();
    render(<QuickAdd />);
    const input = screen.getByLabelText('Quick add');
    await user.type(input, 'xyzcorp 700');
    expect(screen.getByLabelText('Category')).toHaveValue('');
    expect(screen.getByText(/Ledger will remember it/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });

  it('flags months other than this one', async () => {
    const user = userEvent.setup();
    render(<QuickAdd />);
    await user.type(screen.getByLabelText('Quick add'), 'taxi 340 5th sep');
    expect(screen.getByTestId('chip-month')).toHaveTextContent('Saves to September 2026');
  });
});

describe('privacy', () => {
  it('keeps the real amount out of the page text, attributes and title', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/transactions';
    render(<App />);
    await user.type(screen.getByLabelText('Quick add'), 'shawarma 1234 upi{Enter}');
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    const real = fmtMoney(123400);
    expect(document.body.textContent).toContain(real);

    await user.click(screen.getByRole('button', { name: 'Privacy mode' }));
    await waitFor(() => expect(document.body.textContent).not.toContain(real));
    const attributes = [...document.querySelectorAll('*')].flatMap((el) =>
      [...el.attributes].map((a) => a.value),
    );
    expect(attributes.join(' ')).not.toContain('1,234');
    expect(document.title).not.toContain('1,234');
    expect(document.body.textContent).not.toContain('1,234');
    expect(document.querySelectorAll('.amt[data-masked]').length).toBeGreaterThan(0);
  });
});
