import { create } from 'zustand';
import type { RecapPeriod } from '../domain/recap';

/** Screen-wide UI that several pages open (Drop 11): the command palette, a recap, Customise. */
interface UiState {
  paletteOpen: boolean;
  /** Opened at least once, so its code is loaded and it stays mounted. */
  paletteUsed: boolean;
  recap: RecapPeriod | null;
  customising: boolean;
  setPalette: (open: boolean) => void;
  openRecap: (period: RecapPeriod) => void;
  closeRecap: () => void;
  setCustomising: (on: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  paletteUsed: false,
  recap: null,
  customising: false,
  setPalette: (paletteOpen) =>
    set((s) => ({ paletteOpen, paletteUsed: s.paletteUsed || paletteOpen })),
  openRecap: (recap) => set({ recap, paletteOpen: false }),
  closeRecap: () => set({ recap: null }),
  setCustomising: (customising) => set({ customising }),
}));
