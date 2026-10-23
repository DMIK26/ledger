import { lazy } from 'react';

/**
 * Parts of the start-up screens that are only needed now and then (Drop 12): the Add sheet's three
 * forms and the inline edit form, the lock screen, and the close-the-month card. They load on first
 * use and are precached, so they still open offline. Tests swap this file for `deferred.eager.tsx`
 * (see vite.config.ts) so they render in one pass.
 */
export const EntryForm = lazy(() => import('./EntryForm').then((m) => ({ default: m.EntryForm })));
export const Keypad = lazy(() => import('./Keypad').then((m) => ({ default: m.Keypad })));
export const Several = lazy(() => import('./Several').then((m) => ({ default: m.Several })));
export const LockScreen = lazy(() =>
  import('./LockScreen').then((m) => ({ default: m.LockScreen })),
);
export const MonthCloseCard = lazy(() =>
  import('./plan/MonthClose').then((m) => ({ default: m.MonthCloseCard })),
);
