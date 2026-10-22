import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLedger, type EntryDraft } from '../data/store';
import { useDoodle } from '../doodle/state';
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

beforeAll(async () => {
  await useLedger.getState().init();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  const db = useLedger.getState().getDb();
  for (const store of ['transactions', 'budgets', 'notes', 'sketches'] as const)
    await db.clear(store);
  useView.setState({ pins: [], month: null, announcement: '' });
  useDoodle.setState({ sketchOn: false, notesOpen: false, caption: null, tool: 'pen' });
  await act(async () => {
    await useLedger.getState().setSetting('privacy', false);
    await useLedger.getState().setSetting('doodles', true);
    await useLedger.getState().setSetting('motion', 'full');
    useLedger.setState({ transactions: [], budgets: [], notes: [], sketches: [], notice: null });
    await useLedger
      .getState()
      .addEntry(
        draft({ date: '2026-10-01', amountMinor: 800000, merchant: 'Rent', categoryId: 'housing' }),
      );
    await useLedger.getState().addEntry(draft());
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

describe('the pencil', () => {
  it('sits in the sidebar with a mood, and shows the top insight when clicked', async () => {
    await go('#/');
    const pencil = within(screen.getByTestId('companion')).getByRole('button', {
      name: /The pencil, relaxed/,
    });
    await userEvent.setup().click(pencil);
    // The same observation that heads "Worth knowing".
    const first = within(screen.getByTestId('insights')).getAllByRole('listitem')[0]!;
    expect(await screen.findByTestId('companion-bubble')).toHaveTextContent(first.textContent!);
  });

  it('gets worried near the budget and dizzy over it', async () => {
    await act(async () => {
      await useLedger.getState().setMonthBudgets('2026-10', { overall: 1_000_000, categories: {} });
    });
    await go('#/');
    expect(
      screen.getByRole('button', { name: /The pencil, a little worried/ }),
    ).toBeInTheDocument();
    await act(async () => {
      await useLedger.getState().setMonthBudgets('2026-10', { overall: 500_000, categories: {} });
    });
    expect(screen.getByRole('button', { name: /The pencil, dizzy/ })).toBeInTheDocument();
    // The budget card wears the same face.
    expect(document.querySelector('.budget-card [data-mood="dizzy"]')).not.toBeNull();
  });

  it('Ask opens questions about the page; an answer without a target speaks in the bubble', async () => {
    await go('#/');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const ring = screen.getByRole('group', { name: 'Ask the pencil' });
    expect(
      within(ring)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Where did most of it go?',
      'Am I on budget?',
      'What was the biggest one?',
      'How does this month compare?',
      'Sketch on this page',
      'Notes',
    ]);
    await user.click(within(ring).getByRole('button', { name: 'Am I on budget?' }));
    expect(await screen.findByTestId('companion-bubble')).toHaveTextContent(
      'There is no budget for this month yet.',
    );
    expect(screen.queryByRole('group', { name: 'Ask the pencil' })).toBeNull();
  });

  it('switching doodles off removes the pencil and the drawings but keeps notes', async () => {
    await act(async () => {
      await useLedger.getState().saveNote({ anchor: 'category:food', page: '/', text: 'mine' });
      await useLedger.getState().setSetting('doodles', false);
    });
    await go('#/');
    expect(screen.queryByTestId('companion')).toBeNull();
    expect(document.documentElement.dataset.doodles).toBe('off');
    expect(useLedger.getState().notes).toHaveLength(1);
  });
});

describe('sketch mode and notes', () => {
  it('D turns sketch mode on and Escape turns it off; the layer only takes clicks while sketching', async () => {
    await go('#/');
    expect(document.querySelector('.sketch-capture')).toBeNull();
    fireEvent.keyDown(window, { key: 'd' });
    expect(await screen.findByTestId('sketch-toolbar')).toBeInTheDocument();
    expect(document.querySelector('.sketch-capture')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('sketch-toolbar')).toBeNull();
  });

  it('D does nothing while typing', async () => {
    await go('#/');
    const input = screen.getByLabelText('Quick add');
    input.focus();
    fireEvent.keyDown(input, { key: 'd' });
    expect(screen.queryByTestId('sketch-toolbar')).toBeNull();
  });

  it('Shift+N lists notes and stamps with what they are attached to; numbers hide in privacy mode', async () => {
    await act(async () => {
      await useLedger
        .getState()
        .saveNote({ anchor: 'category:food', page: '/', text: 'chai is 1,200 now' });
      await useLedger
        .getState()
        .saveNote({ anchor: 'budget:overall', page: '/budgets', text: '', stamp: 'check' });
    });
    await go('#/');
    fireEvent.keyDown(window, { key: 'N', shiftKey: true });
    const list = await screen.findByTestId('notes-list');
    expect(list).toHaveTextContent('chai is 1,200 now');
    expect(list).toHaveTextContent('On Food & Dining, Dashboard');
    expect(list).toHaveTextContent('On Monthly budget, Budgets');
    await act(async () => {
      await useLedger.getState().setSetting('privacy', true);
    });
    expect(list).toHaveTextContent('chai is ••• now');
    expect(list).not.toHaveTextContent('1,200');
  });

  it('deleting a note from the list can be undone', async () => {
    await act(async () => {
      await useLedger.getState().saveNote({ anchor: 'category:food', page: '/', text: 'keep me' });
    });
    await go('#/');
    fireEvent.keyDown(window, { key: 'N', shiftKey: true });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete note on Food & Dining' }));
    // Deleting is asynchronous (IndexedDB); wait for it rather than racing it.
    await waitFor(() => expect(useLedger.getState().notes).toHaveLength(0));
    await act(async () => {
      await useLedger.getState().undo();
    });
    expect(useLedger.getState().notes.map((n) => n.text)).toEqual(['keep me']);
  });

  it('saving an entry draws its category doodle', async () => {
    await go('#/');
    await act(async () => {
      await useLedger.getState().addEntry(draft({ merchant: 'Uber', categoryId: 'transport' }));
    });
    expect(await screen.findByTestId('doodle-burst')).toHaveTextContent('Transport & Travel');
  });
});
