import { useEffect, useState, type RefObject } from 'react';

/** The element's content size, kept current with a ResizeObserver. Falls back when unsupported. */
export function useSize(
  ref: RefObject<HTMLElement | null>,
  fallback: { width: number; height: number } = { width: 560, height: 240 },
): { width: number; height: number } {
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0) setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
