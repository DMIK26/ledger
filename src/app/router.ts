import { useSyncExternalStore } from 'react';

export const ROUTES = [
  '/',
  '/transactions',
  '/money',
  '/budgets',
  '/reports',
  '/recurring',
  '/settings',
] as const;
export type RoutePath = (typeof ROUTES)[number];

export interface Route {
  path: RoutePath;
  query: URLSearchParams;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

const getHash = (): string => window.location.hash;

/** Splits "#/transactions?action=add" into a known path and its query. Unknown paths fall back to "/". */
export function parseHash(hash: string): Route {
  const body = hash.replace(/^#/, '');
  const [rawPath = '', search = ''] = body.split('?');
  const path = (ROUTES as readonly string[]).includes(rawPath) ? (rawPath as RoutePath) : '/';
  return { path, query: new URLSearchParams(search) };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  return parseHash(hash);
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}

export const href = (path: string): string => `#${path}`;
