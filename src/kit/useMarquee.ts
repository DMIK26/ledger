import { useRef, useState, type PointerEvent, type RefObject } from 'react';

export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [role="slider"]';

/**
 * Marquee selection with a mouse: drag across rows marked `data-id` inside the container to select
 * them (Shift or Cmd/Ctrl adds to the selection). Touch keeps normal scrolling; checkboxes cover it.
 */
export function useMarquee(
  container: RefObject<HTMLElement | null>,
  onSelect: (ids: string[], additive: boolean) => void,
) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<MarqueeRect | null>(null);
  const [preview, setPreview] = useState<Set<string>>(new Set());

  const hits = (r: DOMRect): string[] => {
    const rows = container.current?.querySelectorAll<HTMLElement>('[data-id]') ?? [];
    const out: string[] = [];
    rows.forEach((row) => {
      const b = row.getBoundingClientRect();
      if (b.right >= r.left && b.left <= r.right && b.bottom >= r.top && b.top <= r.bottom)
        out.push(row.dataset.id!);
    });
    return out;
  };

  const box = (x: number, y: number): DOMRect => {
    const s = start.current!;
    return new DOMRect(Math.min(s.x, x), Math.min(s.y, y), Math.abs(x - s.x), Math.abs(y - s.y));
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    start.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!start.current || !container.current) return;
    const r = box(e.clientX, e.clientY);
    if (r.width < 4 && r.height < 4) return;
    e.preventDefault();
    const c = container.current.getBoundingClientRect();
    setRect({ left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height });
    setPreview(new Set(hits(r)));
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (!start.current) return;
    const dragged = rect !== null;
    const ids = dragged ? hits(box(e.clientX, e.clientY)) : [];
    start.current = null;
    setRect(null);
    setPreview(new Set());
    if (dragged) onSelect(ids, e.shiftKey || e.metaKey || e.ctrlKey);
  };

  return {
    rect,
    preview,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
