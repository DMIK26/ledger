import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useLedger } from '../data/store';
import { todayISO } from '../domain/dates';
import { App } from './App';

const today = todayISO();

beforeAll(async () => {
  await useLedger.getState().init();
});

beforeEach(async () => {
  const s = useLedger.getState();
  if (s.transactions.length) await s.bulkDelete(s.transactions.map((t) => t.id));
  for (const f of useLedger.getState().flows) await useLedger.getState().deleteFlow(f.id);
  for (const p of useLedger.getState().people) await useLedger.getState().deletePerson(p.id);
  for (const a of useLedger.getState().accounts) await useLedger.getState().deleteAccount(a.id);
  if (useLedger.getState().settings.privacy) await s.setSetting('privacy', false);
  await s.setSetting('addMode', 'form');
});

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const go = async (hash: string) => {
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
};

describe('money in from quick add', () => {
  it('saves "salary" as money in, not spending', async () => {
    await go('#/');
    const input = screen.getByLabelText('Quick add');
    fireEvent.change(input, { target: { value: 'salary 40k upi' } });
    expect(screen.getByTestId('chip-income')).toHaveTextContent('Money in');
    expect(screen.getByLabelText('Kind of money in')).toHaveValue('salary');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(useLedger.getState().flows).toHaveLength(1));
    expect(useLedger.getState().flows[0]).toMatchObject({ kind: 'income', amountMinor: 4_000_000 });
    expect(useLedger.getState().transactions).toHaveLength(0);
  });

  it('can be switched back to spending', async () => {
    await go('#/');
    const input = screen.getByLabelText('Quick add');
    fireEvent.change(input, { target: { value: 'refund 299' } });
    await userEvent.click(within(screen.getByTestId('chip-income')).getByRole('button'));
    expect(screen.getByTestId('chip-income')).toHaveTextContent('Spending');
    expect(screen.getByTestId('chip-category')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    expect(useLedger.getState().flows).toHaveLength(0);
  });
});

describe('the Add form', () => {
  it('stores a foreign amount in rupees and keeps the original', async () => {
    await go('#/?action=add');
    const dialog = await screen.findByRole('dialog', { name: 'Add expense' });
    await userEvent.click(within(dialog).getByLabelText('Paid in another currency'));
    await userEvent.selectOptions(within(dialog).getByLabelText('Currency'), 'EUR');
    await userEvent.type(within(dialog).getByLabelText('Amount in EUR'), '20');
    await userEvent.type(within(dialog).getByLabelText('Rate, rupees for 1 EUR'), '90.5');
    expect(within(dialog).getByTestId('fx-result')).toHaveTextContent('= ₹1,810.00 at ₹90.50');
    await userEvent.type(within(dialog).getByLabelText('What for'), 'Museum');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    expect(useLedger.getState().transactions[0]).toMatchObject({
      amountMinor: 181_000,
      foreign: { currency: 'EUR', amountMinor: 2_000, rate4: 905_000 },
    });
  });

  it('offers accounts once there are some, defaulting to the method’s account', async () => {
    const bank = await useLedger.getState().saveAccount({
      name: 'HDFC',
      kind: 'bank',
      openingMinor: 0,
      openingDate: today,
      methods: ['UPI'],
    });
    const cash = await useLedger.getState().saveAccount({
      name: 'Wallet',
      kind: 'cash',
      openingMinor: 0,
      openingDate: today,
      methods: ['Cash'],
    });
    await go('#/?action=add');
    const dialog = await screen.findByRole('dialog', { name: 'Add expense' });
    const from = within(dialog).getByLabelText('From account');
    expect(
      within(from)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['HDFC (UPI)', 'Wallet']);
    await userEvent.selectOptions(from, cash);
    await userEvent.type(within(dialog).getByLabelText('Amount'), '50');
    await userEvent.type(within(dialog).getByLabelText('What for'), 'Tea');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    expect(useLedger.getState().transactions[0]!.accountId).toBe(cash);
    expect(bank).toBeTruthy();
  });
});

describe('the Money page', () => {
  it('shows cash flow, and money in never reaches spending pages', async () => {
    await useLedger.getState().addIncome({
      date: today,
      amountMinor: 5_000_000,
      label: 'Salary',
      incomeKind: 'salary',
    });
    await go('#/money');
    expect(await screen.findByTestId('cashflow-in')).toHaveTextContent('₹50,000.00');
    expect(screen.getByTestId('cashflow-left')).toHaveTextContent('₹50,000.00');
    expect(screen.getByRole('list', { name: 'Money in this month' })).toHaveTextContent('Salary');
    cleanup();
    await go('#/');
    expect(screen.getByText('Nothing logged yet')).toBeInTheDocument();
  });

  it('turns off reminders in privacy mode', async () => {
    await useLedger.getState().saveUdhaar({
      personName: 'Rahul',
      kind: 'lent',
      date: today,
      amountMinor: 50_000,
      note: '',
    });
    await useLedger.getState().setSetting('privacy', true);
    await go('#/money?view=udhaar');
    await userEvent.click(await screen.findByRole('button', { name: /^Rahul/ }));
    expect(screen.getByRole('button', { name: 'Remind' })).toBeDisabled();
    expect(screen.getByText(/off in privacy mode/)).toBeInTheDocument();
  });
});
