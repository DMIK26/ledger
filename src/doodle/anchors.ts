import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const sameBoxes = (a: Record<string, Box>, b: Record<string, Box>): boolean => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    const p = a[k]!;
    const q = b[k];
    return q !== undefined && p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h;
  });
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Where each anchored thing is drawn, relative to the layer. Re-measured (once per frame at most)
 * whenever the page resizes, its content changes or a transition ends, so notes follow their element.
 */
export function useAnchorBoxes(
  layer: RefObject<HTMLElement | null>,
  anchors: readonly string[],
): Record<string, Box> {
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const key = anchors.join('\n');

  useEffect(() => {
    const el = layer.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const list = key ? key.split('\n') : [];
    let frame = 0;
    const measure = () => {
      frame = 0;
      const origin = el.getBoundingClientRect();
      const next: Record<string, Box> = {};
      for (const anchor of list) {
        const safe = anchor.replace(/["\\]/g, '\\$&');
        const target = host.querySelector(`[data-anchor="${safe}"]`);
        if (!target) continue;
        const r = target.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        next[anchor] = {
          x: r1(r.left - origin.left),
          y: r1(r.top - origin.top),
          w: r1(r.width),
          h: r1(r.height),
        };
      }
      setBoxes((prev) => (sameBoxes(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(host);
    const mo = new MutationObserver((records) => {
      // Our own markers moving is not a reason to measure again.
      if (records.every((m) => el.contains(m.target))) return;
      schedule();
    });
    mo.observe(host, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', schedule);
    host.addEventListener('transitionend', schedule);
    host.addEventListener('animationend', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', schedule);
      host.removeEventListener('transitionend', schedule);
      host.removeEventListener('animationend', schedule);
    };
  }, [layer, key]);

  return boxes;
}

const DESKTOP = '(min-width: 900px)';

function subscribeDesktop(cb: () => void): () => void {
  const mq = window.matchMedia?.(DESKTOP);
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

/** True at desktop width (900px and up). Without matchMedia (tests) it counts as desktop. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia?.(DESKTOP).matches ?? true,
    () => true,
  );
}
