import { useEffect, useRef } from 'react';

/**
 * Android's back button (and the browser's) closes the top sheet before it leaves the page. Each open
 * layer pushes one history entry; back pops it and closes only the top layer. Closing a layer any
 * other way removes its entry again.
 */
interface Layer {
  token: string;
  close: () => void;
}

const stack: Layer[] = [];
let ignore = 0;
let listening = false;

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', () => {
    if (ignore > 0) {
      ignore -= 1;
      return;
    }
    stack.pop()?.close();
  });
}

function push(close: () => void): string {
  listen();
  const token = `${Date.now().toString(36)}-${stack.length}-${Math.random().toString(36).slice(2, 7)}`;
  stack.push({ token, close });
  history.pushState({ ...(history.state as object | null), ledgerLayer: token }, '');
  return token;
}

function remove(token: string): void {
  const i = stack.findIndex((l) => l.token === token);
  if (i === -1) return; // already closed by back
  stack.splice(i, 1);
  // Our entry is still on top: step back over it quietly.
  if ((history.state as { ledgerLayer?: string } | null)?.ledgerLayer === token) {
    ignore += 1;
    history.back();
  }
}

/** While `open`, the back button calls `close` instead of leaving the page. */
export function useBackClose(open: boolean, close: () => void): void {
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const token = push(() => latest.current());
    return () => remove(token);
  }, [open]);
}

/**
 * Leaves a layer for another page. Replacing the layer's history entry (instead of adding one)
 * keeps back working: it returns to the page the layer was opened on.
 */
export function replaceRoute(path: string): void {
  window.location.replace(`#${path}`);
}
