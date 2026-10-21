import { useLedger } from '../data/store';

/** A tiny vibration when a drag snaps to the next step, on phones that support it and when enabled. */
export function tick(): void {
  if (!useLedger.getState().settings.haptics) return;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')
    navigator.vibrate(6);
}
