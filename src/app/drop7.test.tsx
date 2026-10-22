import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useLedger } from '../data/store';
import { useDoodle } from '../doodle/state';
import { App } from './App';

beforeAll(async () => {
  await useLedger.getState().init();
});

beforeEach(() => {
  useDoodle.setState({ sketchOn: false, notesOpen: false, caption: null });
});

afterEach(() => {
  cleanup();
  window.location.hash = '';
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

const go = async (hash: string) => {
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
};

describe('the back button closes the top layer first', () => {
  it('back closes the notes list and sketch mode, one at a time, and stays on the page', async () => {
    await go('#/budgets');
    fireEvent.keyDown(window, { key: 'd' });
    await screen.findByTestId('sketch-toolbar');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('sketch-toolbar')).toBeNull();
    // Closing it another way stepped back over its history entry.
    await new Promise((r) => setTimeout(r, 50));

    act(() => useDoodle.getState().setSketch(true));
    act(() => useDoodle.getState().setNotesOpen(true));
    await new Promise((r) => setTimeout(r, 20));
    // Back: the notes list (opened last) closes, sketch mode stays.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(useDoodle.getState().notesOpen).toBe(false);
    expect(useDoodle.getState().sketchOn).toBe(true);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(useDoodle.getState().sketchOn).toBe(false);
    expect(window.location.hash).toBe('#/budgets');
  });
});

describe('voice quick add', () => {
  it('fills quick add with what was said, in Indian English', async () => {
    let instance: {
      lang: string;
      onresult: ((e: unknown) => void) | null;
      onend: (() => void) | null;
    } | null = null;
    class FakeRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        instance = this;
      }
      start() {}
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
      FakeRecognition;
    await go('#/');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Speak an entry' }));
    expect(instance!.lang).toBe('en-IN');
    expect(screen.getByText(/Listening/)).toBeInTheDocument();
    act(() =>
      instance!.onresult!({
        results: [Object.assign([{ transcript: 'chai twenty cash' }], { isFinal: true })],
      }),
    );
    act(() => instance!.onend!());
    await waitFor(() => expect(screen.getByLabelText('Quick add')).toHaveValue('chai twenty cash'));
    expect(screen.getByTestId('chip-amount')).toHaveTextContent('₹20.00');
  });

  it('shows no microphone where the browser cannot listen', async () => {
    await go('#/');
    expect(screen.queryByRole('button', { name: 'Speak an entry' })).toBeNull();
  });

  it('in an iPhone home-screen app the mic opens the keyboard, whose own mic works there', async () => {
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = class {};
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1',
      configurable: true,
    });
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    try {
      await go('#/');
      await userEvent.setup().click(screen.getByRole('button', { name: 'Speak an entry' }));
      expect(screen.getByLabelText('Quick add')).toHaveFocus();
      expect(screen.getByText(/Tap the mic on your keyboard/)).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, 'userAgent', { value: 'jsdom', configurable: true });
      Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
    }
  });

  it('typing while listening stops listening, so the words heard cannot overwrite it', async () => {
    let stops = 0;
    class Rec {
      lang = '';
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      start() {}
      stop() {
        stops += 1;
        this.onend?.();
      }
      abort() {}
    }
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Rec;
    await go('#/');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Speak an entry' }));
    await user.type(screen.getByLabelText('Quick add'), 'x');
    expect(stops).toBe(1);
    expect(screen.getByRole('button', { name: 'Speak an entry' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
