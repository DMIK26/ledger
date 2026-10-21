/** Phones use swipes from the screen edges for back and app switching; gestures starting there are ignored. */
export const EDGE_PX = 24;

export function fromScreenEdge(e: { clientX: number; pointerType: string }): boolean {
  if (e.pointerType === 'mouse' || typeof window === 'undefined') return false;
  return e.clientX < EDGE_PX || e.clientX > window.innerWidth - EDGE_PX;
}
