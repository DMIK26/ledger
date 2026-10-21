import { flushSync } from 'react-dom';
import { motionReduced } from './spring';

type DocWithVT = Document & { startViewTransition?: (cb: () => void) => unknown };

/** Runs a state change inside a View Transition where supported and motion is on; otherwise directly. */
export function withTransition(update: () => void): void {
  const doc = document as DocWithVT;
  if (typeof doc.startViewTransition !== 'function' || motionReduced()) {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}
