import { useMemo } from 'react';
import { create } from 'zustand';
import { useLedger } from '../data/store';
import { monthKey, todayISO } from '../domain/dates';
import { applyPins, samePin, togglePin, type Pin } from '../domain/pins';
import { tl } from '../domain/i18n';

/**
 * What the user is looking at, shared by every page: pinned entities (a filter on everything) and the
 * month chosen in the month switcher. Session only; nothing here is saved.
 */
interface ViewState {
  pins: Pin[];
  /** 'YYYY-MM', or null to follow the current month. */
  month: string | null;
  /** Polite message for screen readers, e.g. after pinning. */
  announcement: string;
  togglePin: (pin: Pin) => void;
  removePin: (pin: Pin) => void;
  popPin: () => void;
  clearPins: () => void;
  setMonth: (month: string | null) => void;
  announce: (text: string) => void;
}

export const useView = create<ViewState>((set, get) => ({
  pins: [],
  month: null,
  announcement: '',
  togglePin: (pin) => {
    const on = !get().pins.some((p) => samePin(p, pin));
    set({ pins: togglePin(get().pins, pin) });
    get().announce(
      on
        ? tl('Pinned {0}. Every page now shows only this.', pin.label)
        : tl('Unpinned {0}.', pin.label),
    );
  },
  removePin: (pin) => {
    set({ pins: get().pins.filter((p) => !samePin(p, pin)) });
    get().announce(tl('Unpinned {0}.', pin.label));
  },
  popPin: () => {
    const last = get().pins.at(-1);
    if (last) get().removePin(last);
  },
  clearPins: () => {
    set({ pins: [] });
    get().announce(tl('Cleared all pins.'));
  },
  setMonth: (month) => set({ month: month === monthKey(todayISO()) ? null : month }),
  // A trailing space when repeating forces screen readers to read the same text again.
  announce: (text) => set({ announcement: text === get().announcement ? `${text} ` : text }),
}));

export const usePins = (): Pin[] => useView((s) => s.pins);

/** The month the switcher is on ('YYYY-MM'). */
export function useViewMonth(): string {
  const month = useView((s) => s.month);
  return month ?? monthKey(todayISO());
}

/** All entries, narrowed by the pins. Every page reads entries through this. */
export function useScopedTransactions() {
  const transactions = useLedger((s) => s.transactions);
  const pins = usePins();
  return useMemo(() => applyPins(transactions, pins), [transactions, pins]);
}
