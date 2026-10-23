import { lazy } from 'react';

/**
 * Pages loaded on first visit, so start-up only downloads the Dashboard (Transactions joined them in
 * Drop 13). Every chunk
 * is still precached by the service worker, so they open offline too. Tests swap this file for
 * `lazy.eager.tsx` (see vite.config.ts) so pages render in one pass.
 */
export const Budgets = lazy(() => import('./Budgets').then((m) => ({ default: m.Budgets })));
export const Reports = lazy(() => import('./Reports').then((m) => ({ default: m.Reports })));
export const Recurring = lazy(() => import('./Recurring').then((m) => ({ default: m.Recurring })));
export const Settings = lazy(() => import('./Settings').then((m) => ({ default: m.Settings })));
export const MoneyPage = lazy(() => import('./Money').then((m) => ({ default: m.MoneyPage })));
export const MerchantPage = lazy(() =>
  import('./Merchant').then((m) => ({ default: m.MerchantPage })),
);
export const Transactions = lazy(() =>
  import('./Transactions').then((m) => ({ default: m.Transactions })),
);
