import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export type Snap = 'half' | 'full';

/** How far (px) a drag must go before it changes the snap point, or closes from half height. */
export const SNAP_STEP = 60;
export const CLOSE_STEP = 140;

/** Where a released drag lands: up opens to full, down goes to half, further down closes. */
export function snapAfterDrag(from: Snap, dy: number): Snap | 'close' {
  if (dy <= -SNAP_STEP) return 'full';
  if (from === 'full') {
    if (dy >= CLOSE_STEP * 2) return 'close';
    return dy >= SNAP_STEP ? 'half' : 'full';
  }
  return dy >= CLOSE_STEP ? 'close' : 'half';
}

/**
 * Bottom-sheet snap points for phones (Drop 11): the handle drags the sheet between half and full
 * height, or down to close. Keyboard: Enter or Space toggles, the up arrow opens fully, the down arrow
 * goes to half, then closes.
 */
export function useSheetSnap(open: boolean, onClose: () => void) {
  const [snap, setSnap] = useState<Snap>('full');
  const [dy, setDy] = useState<number | null>(null);
  const start = useRef<number | null>(null);
  // Every opening starts at full height.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSnap('full');
    setDy(null);
  }

  const finish = (offset: number) => {
    start.current = null;
    setDy(null);
    const next = snapAfterDrag(snap, offset);
    if (next === 'close') onClose();
    else setSnap(next);
  };

  const handleProps = {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': snap === 'full' ? 'Make the sheet smaller' : 'Make the sheet full height',
    className: 'sheet-handle',
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      start.current = e.clientY;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (start.current !== null) setDy(e.clientY - start.current);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (start.current === null) return;
      const offset = e.clientY - start.current;
      // A tap without movement toggles, like Enter.
      if (Math.abs(offset) < 4) {
        start.current = null;
        setDy(null);
        setSnap((s) => (s === 'full' ? 'half' : 'full'));
      } else finish(offset);
    },
    onPointerCancel: () => {
      start.current = null;
      setDy(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSnap((s) => (s === 'full' ? 'half' : 'full'));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSnap('full');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (snap === 'half') onClose();
        else setSnap('half');
      }
    },
  };

  return {
    snap,
    /** Follows the finger while dragging (never above the snap point). */
    style: dy !== null ? { transform: `translateY(${Math.max(0, dy)}px)` } : undefined,
    handleProps,
  };
}
