import { useLedger } from '../data/store';

let audio: AudioContext | null = null;

/** A short, quiet click made on the fly (no sound files). */
function click(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.035);
  } catch {
    /* no audio: the tick is only a nicety */
  }
}

/** When a drag snaps to the next step: a tiny vibration and, if chosen, a soft click. */
export function tick(): void {
  const { haptics, sounds } = useLedger.getState().settings;
  if (sounds) click();
  if (!haptics) return;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')
    navigator.vibrate(6);
}
