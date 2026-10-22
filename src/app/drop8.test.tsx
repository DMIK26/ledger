import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NO_SPEND_KEY, setSettingsList } from '../data/commands';
import { useLedger, type EntryDraft } from '../data/store';
import { addDays, setMonthStartDay, todayISO } from '../domain/dates';
import { App } from './App';
import { habitText, shortDay } from './CheckIn';
import { pressKey } from './Keypad';

const today = todayISO();
const draft = (date: string, merchant = 'Lunch', amountMinor = 15000): EntryDraft => ({
  date,
  amountMinor,
  merchant,
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
});

beforeAll(async () => {
  await useLedger.getState().init();
});

const clearAll = async () => {
  const s = useLedger.getState();
  if (s.transactions.length) await s.bulkDelete(s.transactions.map((t) => t.id));
  for (const f of useLedger.getState().favourites) await useLedger.getState().removeFavourite(f.id);
  const days = useLedger.getState().noSpendDays;
  if (days.length) await s.run(setSettingsList(NO_SPEND_KEY, [], days, 'reset'));
  await s.setSetting('checkinHiddenOn', '');
  await s.setSetting('addMode', 'form');
  await s.setSetting('monthStartDay', 1);
};

beforeEach(async () => {
  await clearAll();
});

afterEach(() => {
  cleanup();
  window.location.hash = '';
  setMonthStartDay(1);
});

const go = async (hash: string) => {
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
};

describe('missed-day check-in', () => {
  it('asks about days with nothing logged, marks no spend, and can wait until tomorrow', async () => {
    await useLedger.getState().addEntry(draft(addDays(today, -3)));
    await go('#/');
    const card = await screen.findByTestId('checkin');
    expect(within(card).getByRole('heading')).toHaveTextContent(
      'Nothing logged on 2 days this week',
    );
    const yesterday = shortDay(addDays(today, -1));
    await userEvent.click(within(card).getByRole('button', { name: `No spend on ${yesterday}` }));
    await waitFor(() =>
      expect(screen.getByTestId('checkin').querySelector('h2')).toHaveTextContent(
        `Nothing logged on ${shortDay(addDays(today, -2))}`,
      ),
    );
    expect(useLedger.getState().noSpendDays).toContain(addDays(today, -1));

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByTestId('checkin')).toBeNull());
    expect(screen.getByTestId('habit-line')).toHaveTextContent('Logged 2 of the last 3 days.');
  });

  it('Add opens the Add sheet on that day', async () => {
    await useLedger.getState().addEntry(draft(addDays(today, -2)));
    await go('#/');
    const day = addDays(today, -1);
    await userEvent.click(
      await screen.findByRole('button', { name: `Add an entry for ${shortDay(day)}` }),
    );
    expect(window.location.hash).toBe(`#/?action=add&on=${day}`);
    const dialog = await screen.findByRole('dialog', { name: 'Add expense' });
    expect(within(dialog).getByLabelText('Date')).toHaveValue(day);
  });

  it('words the habit kindly', () => {
    expect(
      habitText({ windowDays: 30, loggedInWindow: 26, run: 12, restUsed: 1, restSaved: 1 }),
    ).toBe(
      'Logged 26 of the last 30 days. 12 days in a row, with a rest day. A rest day saved for a day off.',
    );
    expect(habitText({ windowDays: 5, loggedInWindow: 3, run: 0, restUsed: 0, restSaved: 0 })).toBe(
      'Logged 3 of the last 5 days.',
    );
  });
});

describe('repeat chips', () => {
  it('offers what is logged often and adds it for today in one tap, undoably', async () => {
    for (const d of [-3, -2, -1])
      await useLedger.getState().addEntry(draft(addDays(today, d), 'Chai', 2000));
    await go('#/');
    const chip = await screen.findByRole('button', { name: /^Add Chai, .*, for today$/ });
    await userEvent.click(chip);
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(4));
    expect(useLedger.getState().transactions[0]).toMatchObject({ date: today, source: 'repeat' });
    await useLedger.getState().undo();
    expect(useLedger.getState().transactions).toHaveLength(3);
  });

  it('a favourite saved from Transactions comes first', async () => {
    await useLedger.getState().addEntry(draft(today, 'Metro', 4000));
    await go('#/transactions');
    await userEvent.click(await screen.findByRole('checkbox', { name: /Select Metro/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save as favourite' }));
    await waitFor(() => expect(useLedger.getState().favourites).toHaveLength(1));
    const chips = await screen.findAllByTestId('repeat-chip');
    expect(chips[0]).toHaveAccessibleName(/^Add Metro/);
  });

  it('copies selected entries to today', async () => {
    await useLedger.getState().addEntry(draft(addDays(today, -1), 'Bus', 3000));
    await go('#/transactions');
    await userEvent.click(await screen.findByRole('checkbox', { name: /Select Bus/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy to today' }));
    await waitFor(() =>
      expect(
        useLedger
          .getState()
          .transactions.map((t) => t.date)
          .sort(),
      ).toEqual([addDays(today, -1), today].sort()),
    );
  });
});

describe('the keypad', () => {
  it('builds sums sensibly', () => {
    const typed = (keys: string[]) => keys.reduce(pressKey, '');
    expect(typed(['2', '5', '0', '+', '1', '2', '0'])).toBe('250+120');
    expect(typed(['+'])).toBe('');
    expect(typed(['5', '+', '×', '2'])).toBe('5×2');
    expect(typed(['.', '5', '.', '5'])).toBe('0.55');
    expect(typed(['1', '.', '2', '5', '9'])).toBe('1.25');
    expect(typed(['0', '7'])).toBe('7');
    expect(typed(['1', '2', 'back'])).toBe('1');
  });

  it('amount, then a category: saved in two taps', async () => {
    await useLedger.getState().setSetting('addMode', 'keypad');
    await go('#/?action=add');
    const dialog = await screen.findByRole('dialog', { name: 'Add expense' });
    const pad = within(dialog).getByRole('group', { name: /Amount keypad/ });
    for (const k of ['2', '5', '0'])
      await userEvent.click(within(pad).getByRole('button', { name: k }));
    await userEvent.click(within(pad).getByRole('button', { name: 'Plus' }));
    for (const k of ['1', '2', '0'])
      await userEvent.click(within(pad).getByRole('button', { name: k }));
    expect(within(dialog).getByTestId('keypad-amount')).toHaveTextContent('370');
    await userEvent.click(within(dialog).getByRole('button', { name: /to Groceries$/ }));
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    expect(useLedger.getState().transactions[0]).toMatchObject({
      amountMinor: 37000,
      merchant: 'Groceries',
      categoryId: 'groceries',
      source: 'keypad',
      date: today,
    });
  });

  it('hardware keys work and a category without an amount explains itself', async () => {
    await useLedger.getState().setSetting('addMode', 'keypad');
    await go('#/?action=add');
    const dialog = await screen.findByRole('dialog', { name: 'Add expense' });
    await userEvent.click(within(dialog).getByRole('button', { name: /to Health/ }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Type an amount first');
    const pad = within(dialog).getByRole('group', { name: /Amount keypad/ });
    pad.focus();
    await userEvent.keyboard('3*45');
    expect(within(dialog).getByTestId('keypad-amount')).toHaveTextContent('135');
  });
});

describe('several at once', () => {
  it('previews each line and saves the good ones as one step', async () => {
    await useLedger.getState().setSetting('addMode', 'several');
    await go('#/?action=add');
    const dialog = await screen.findByRole('dialog', { name: 'Add expense' });
    fireEvent.change(within(dialog).getByLabelText('One entry per line'), {
      target: { value: 'chai 20 cash\nauto 40+30\nlunch\n' },
    });
    const preview = within(dialog).getByRole('list', { name: 'What each line becomes' });
    expect(within(preview).getAllByRole('listitem')).toHaveLength(3);
    expect(preview).toHaveTextContent('No amount, skipped');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save 2 entries' }));
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(2));
    expect(useLedger.getState().notice).toBe('Added 2 entries');
  });
});

describe('maths and Indian languages in quick add and the form', () => {
  it('quick add saves a Telugu entry with a sum', async () => {
    await go('#/');
    const input = screen.getByLabelText('Quick add');
    fireEvent.change(input, { target: { value: 'కూరగాయలు 100+50 నిన్న' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(useLedger.getState().transactions).toHaveLength(1));
    expect(useLedger.getState().transactions[0]).toMatchObject({
      merchant: 'కూరగాయలు',
      amountMinor: 15000,
      categoryId: 'groceries',
      date: addDays(today, -1),
    });
  });

  it('the amount field shows a sum and keeps its result', async () => {
    await go('#/?action=add');
    const dialog = await screen.findByRole('dialog', { name: 'Add expense' });
    const amount = within(dialog).getByLabelText('Amount');
    await userEvent.type(amount, '250+120/2');
    expect(within(dialog).getByText(/^= ₹310/)).toBeInTheDocument();
    fireEvent.blur(amount);
    expect(amount).toHaveValue('310');
  });
});

describe('month start day', () => {
  it('Settings explains the cycle and the Dashboard follows it', async () => {
    await go('#/settings');
    await userEvent.selectOptions(screen.getByLabelText('Months start on the'), '25');
    await waitFor(() =>
      expect(screen.getByTestId('month-start-help')).toHaveTextContent(/runs 25 \w{3} to 24 \w{3}/),
    );
    expect(useLedger.getState().settings.monthStartDay).toBe(25);
  });
});
