import { useState, type KeyboardEvent } from 'react';

/**
 * Next index for arrow-key navigation in a list (cols = 1) or grid (cols > 1). Returns null for keys
 * that do not move. Home and End jump to the ends.
 */
export function nextIndex(i: number, key: string, n: number, cols = 1): number | null {
  if (n <= 0) return null;
  const clamp = (x: number) => Math.max(0, Math.min(n - 1, x));
  switch (key) {
    case 'ArrowRight':
      return clamp(cols > 1 ? i + cols : i + 1);
    case 'ArrowLeft':
      return clamp(cols > 1 ? i - cols : i - 1);
    case 'ArrowDown':
      return clamp(i + 1);
    case 'ArrowUp':
      return clamp(i - 1);
    case 'Home':
      return 0;
    case 'End':
      return n - 1;
    default:
      return null;
  }
}

/**
 * Roving tabindex: one item in the group is tabbable, arrow keys move focus within it. In a grid,
 * left and right move by `cols` (a week in the calendar), up and down by one.
 */
export function useRoving(n: number, cols = 1) {
  const [active, setActive] = useState(0);
  const current = Math.min(active, Math.max(0, n - 1));
  const props = (i: number) => ({
    tabIndex: i === current ? 0 : -1,
    'data-roving': '',
    onFocus: () => setActive(i),
    onKeyDown: (e: KeyboardEvent<Element>) => {
      const next = nextIndex(i, e.key, n, cols);
      if (next === null || next === i) return;
      e.preventDefault();
      setActive(next);
      const group = (e.currentTarget as Element).closest('[data-roving-group]');
      const items = group?.querySelectorAll<HTMLElement | SVGElement>('[data-roving]');
      (items?.[next] as HTMLElement | undefined)?.focus();
    },
  });
  return { active: current, props };
}
