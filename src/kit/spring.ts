/**
 * A small damped spring for things that follow a target (hover cards, drag labels). Tuned to settle
 * fast with a slight overshoot that never exceeds 8%. Pure step function, so it can be tested.
 */
export interface SpringState {
  x: number;
  v: number;
}

export const SPRING = { stiffness: 260, damping: 26 } as const;

export function springStep(
  s: SpringState,
  target: number,
  dt: number,
  { stiffness, damping }: { stiffness: number; damping: number } = SPRING,
): SpringState {
  // Semi-implicit Euler in small sub-steps keeps it stable for long frames.
  let { x, v } = s;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    const a = -stiffness * (x - target) - damping * v;
    v += a * h;
    x += v * h;
  }
  return { x, v };
}

export const atRest = (s: SpringState, target: number): boolean =>
  Math.abs(s.x - target) < 0.1 && Math.abs(s.v) < 0.1;

/** Whether motion should be skipped: the system asks for less, or Settings > Experience says so. */
export function motionReduced(): boolean {
  if (typeof document === 'undefined') return true;
  const mode = document.documentElement.dataset.motion;
  if (mode === 'off' || mode === 'reduced') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Animates a 2D point towards a moving target and calls `draw` each frame. Stops when at rest, while
 * the tab is hidden, or immediately when motion is reduced. Returns a function that sets the target.
 */
export function createSpring2D(draw: (x: number, y: number) => void) {
  let sx: SpringState = { x: 0, v: 0 };
  let sy: SpringState = { x: 0, v: 0 };
  let tx = 0;
  let ty = 0;
  let frame = 0;
  let last = 0;
  let started = false;

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60);
    last = now;
    sx = springStep(sx, tx, dt);
    sy = springStep(sy, ty, dt);
    draw(sx.x, sy.x);
    if (document.hidden || (atRest(sx, tx) && atRest(sy, ty))) {
      frame = 0;
      return;
    }
    frame = requestAnimationFrame(loop);
  };

  return {
    set(x: number, y: number) {
      tx = x;
      ty = y;
      if (!started || motionReduced() || document.hidden) {
        started = true;
        sx = { x, v: 0 };
        sy = { x: y, v: 0 };
        draw(x, y);
        return;
      }
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(loop);
      }
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      started = false;
    },
  };
}
