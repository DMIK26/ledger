import { fromScreenEdge } from './edge';
import { useSyncExternalStore } from 'react';

/**
 * EntityBus: hovering, focusing or touching-and-holding anything marked `data-hl="<key>"` highlights
 * that entity everywhere: every element with `data-entity` that does not list the key dims to 35%.
 * One set of delegated listeners for the whole page; updates are batched to one per animation frame
 * and applied with a single CSS rule, so no React component re-renders to dim thousands of rows.
 */

export interface Pointer {
  x: number;
  y: number;
  /** Set when the highlight came from keyboard focus: the element's box. */
  rect: DOMRect | null;
}

let current: string | null = null;
let pending: string | null = null;
let scheduled = false;
let pointer: Pointer = { x: 0, y: 0, rect: null };
let style: HTMLStyleElement | null = null;
const listeners = new Set<() => void>();

const raf = (fn: () => void) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16);

function cssFor(key: string): string {
  const safe = key.replace(/["\\]/g, '');
  return `[data-entity]:not([data-entity~="${safe}"]){opacity:0.35}`;
}

function flush() {
  scheduled = false;
  if (pending === current) return;
  current = pending;
  if (style) style.textContent = current ? cssFor(current) : '';
  if (typeof document !== 'undefined') {
    if (current) document.documentElement.dataset.highlight = current;
    else delete document.documentElement.dataset.highlight;
  }
  listeners.forEach((l) => l());
}

export function setHighlight(key: string | null): void {
  pending = key;
  if (!scheduled) {
    scheduled = true;
    raf(flush);
  }
}

export const getHighlight = (): string | null => current;
export const getPointer = (): Pointer => pointer;

export function subscribeHighlight(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHighlight(): string | null {
  return useSyncExternalStore(subscribeHighlight, getHighlight, () => null);
}

const keyFrom = (target: EventTarget | null): { key: string; el: Element } | null => {
  const el = target instanceof Element ? target.closest('[data-hl]') : null;
  const key = el?.getAttribute('data-hl');
  return el && key ? { key, el } : null;
};

/** Attaches the page-wide listeners once. Returns a cleanup for tests. */
export function initEntityBus(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  style = document.createElement('style');
  style.dataset.entityBus = '';
  document.head.append(style);

  let clearTimer = 0;
  let holdTimer = 0;
  let holdStart: { x: number; y: number } | null = null;

  const over = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    pointer = { x: e.clientX, y: e.clientY, rect: null };
    const hit = keyFrom(e.target);
    window.clearTimeout(clearTimer);
    if (hit) setHighlight(hit.key);
    // Leaving to the gap between two slices should not flash the whole page back.
    else clearTimer = window.setTimeout(() => setHighlight(null), 60);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') {
      pointer = { x: e.clientX, y: e.clientY, rect: null };
      if (current) listeners.forEach((l) => l());
    } else if (holdStart && Math.hypot(e.clientX - holdStart.x, e.clientY - holdStart.y) > 10) {
      window.clearTimeout(holdTimer);
      holdStart = null;
    }
  };
  const leaveWindow = (e: PointerEvent) => {
    if (!e.relatedTarget) setHighlight(null);
  };
  const focusIn = (e: FocusEvent) => {
    const hit = keyFrom(e.target);
    if (!hit) return;
    const rect = hit.el.getBoundingClientRect();
    pointer = { x: rect.left + rect.width / 2, y: rect.bottom, rect };
    setHighlight(hit.key);
  };
  const focusOut = (e: FocusEvent) => {
    if (!keyFrom(e.relatedTarget)) setHighlight(null);
  };
  // Touch: hold for 450ms to highlight; the next tap anywhere clears it.
  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (current) setHighlight(null);
    if (fromScreenEdge(e)) return;
    const hit = keyFrom(e.target);
    if (!hit) return;
    holdStart = { x: e.clientX, y: e.clientY };
    holdTimer = window.setTimeout(() => {
      pointer = { x: e.clientX, y: e.clientY - 40, rect: null };
      setHighlight(hit.key);
    }, 450);
  };
  const up = () => {
    window.clearTimeout(holdTimer);
    holdStart = null;
  };
  const escape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && current) setHighlight(null);
  };

  document.addEventListener('pointerover', over);
  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerout', leaveWindow);
  document.addEventListener('focusin', focusIn);
  document.addEventListener('focusout', focusOut);
  document.addEventListener('pointerdown', down);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
  document.addEventListener('keydown', escape);
  return () => {
    document.removeEventListener('pointerover', over);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerout', leaveWindow);
    document.removeEventListener('focusin', focusIn);
    document.removeEventListener('focusout', focusOut);
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    document.removeEventListener('keydown', escape);
    style?.remove();
    style = null;
    current = null;
    pending = null;
  };
}
