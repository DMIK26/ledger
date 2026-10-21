import { useSyncExternalStore } from 'react';

export interface PwaState {
  /** A new version is waiting; reloading applies it. */
  updateReady: boolean;
  /** Set once, the first time everything has been cached for offline use. */
  offlineReady: boolean;
  /** True when running as an installed app rather than in a browser tab. */
  installed: boolean;
  checking: boolean;
}

const OFFLINE_NOTICE_KEY = 'ledger.offlineNoticeShown';

const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

let state: PwaState = {
  updateReady: false,
  offlineReady: false,
  installed: isStandalone(),
  checking: false,
};
const listeners = new Set<() => void>();
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;

function patch(next: Partial<PwaState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = (): PwaState => state;

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Registers the service worker. Production builds only; the dev server has none. */
export async function initPwa(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => patch({ updateReady: true }),
    onOfflineReady: () => {
      let shown = false;
      try {
        shown = localStorage.getItem(OFFLINE_NOTICE_KEY) === '1';
        localStorage.setItem(OFFLINE_NOTICE_KEY, '1');
      } catch {
        /* storage blocked: show it this once */
      }
      if (!shown) patch({ offlineReady: true });
    },
    onRegisteredSW: (_url, reg) => {
      registration = reg;
    },
  });
}

export function applyUpdate(): void {
  void updateSW?.(true);
}

export function dismissOfflineReady(): void {
  patch({ offlineReady: false });
}

/** Asks the server for a newer version. Resolves to true when one is waiting. */
export async function checkForUpdates(): Promise<boolean> {
  if (!registration) return false;
  patch({ checking: true });
  try {
    await registration.update();
  } catch {
    /* offline: nothing to check against */
  } finally {
    patch({ checking: false });
  }
  return state.updateReady || registration.waiting !== null;
}
