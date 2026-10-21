/**
 * Keeps bottom sheets above the on-screen keyboard: --kb is how much of the layout viewport the
 * keyboard covers, from the visual viewport.
 */
export function initViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let frame = 0;
  const update = () => {
    frame = 0;
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--kb', `${Math.round(covered)}px`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  update();
}
