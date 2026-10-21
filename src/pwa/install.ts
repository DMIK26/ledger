import { useSyncExternalStore } from 'react';
import { installMode, type InstallMode } from '../domain/platform';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const standalone = (): boolean =>
  installedNow ||
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function compute(): InstallMode {
  if (typeof window === 'undefined') return 'none';
  return installMode({
    ua: navigator.userAgent,
    standalone: standalone(),
    canPrompt: deferred !== null,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}

let mode: InstallMode = 'none';

/** Listens for the browser's install offer. Called once at start-up. */
export function initInstall(): void {
  mode = compute();
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    mode = compute();
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    mode = compute();
    emit();
  });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(
    subscribe,
    () => mode,
    () => 'none' as InstallMode,
  );
}

/** Shows the browser's own install dialog. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const choice = await e.userChoice;
  mode = compute();
  emit();
  return choice.outcome === 'accepted';
}

/** Asks the browser once, on first run, not to clear Ledger's data when space runs low. */
export async function persistOnce(): Promise<void> {
  try {
    if (localStorage.getItem('ledger.persistAsked') === '1') return;
    localStorage.setItem('ledger.persistAsked', '1');
  } catch {
    return;
  }
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted()))
      await navigator.storage.persist?.();
  } catch {
    /* not supported: Settings > Storage explains */
  }
}
