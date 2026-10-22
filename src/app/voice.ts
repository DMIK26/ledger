import { mergeTranscripts } from '../domain/transcript';
import { isIOS } from '../domain/platform';

/** Voice quick add with the browser's speech recognition (Chrome, Edge and Safari), in Indian English. */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const standalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * - listen: the browser can listen (Chrome, Edge, Safari in a tab)
 * - keyboard: an iPhone home-screen app. Safari exposes the API there but it always fails (WebKit bug
 *   225298), so the button opens the keyboard, whose own mic works everywhere
 * - none: no speech recognition at all
 */
export type VoiceMode = 'listen' | 'keyboard' | 'none';

export function voiceMode(): VoiceMode {
  if (typeof window === 'undefined') return 'none';
  const ios = isIOS(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  if (ios && standalone()) return 'keyboard';
  return ctor() ? 'listen' : 'none';
}

const KEYBOARD_TIP = 'Tap the mic on your keyboard and say something like “chai twenty cash”.';

function message(error: string): string | null {
  switch (error) {
    case 'not-allowed':
      return 'Microphone permission is off. Allow it for this site in the browser settings, or use the mic on your keyboard.';
    case 'service-not-allowed':
      return `Voice input is not available here. ${KEYBOARD_TIP}`;
    case 'audio-capture':
      return 'No microphone was found.';
    case 'no-speech':
      return 'Did not catch that. Try again, a little closer to the phone.';
    case 'network':
      return 'Voice input needs a connection in this browser.';
    case 'aborted':
      return null;
    default:
      return `Voice input stopped. ${KEYBOARD_TIP}`;
  }
}

/** Stop this long after the last words; Safari on iPhone often never ends on its own. */
export const SILENCE_MS = 1500;
/** Never listen longer than this. */
export const MAX_MS = 12_000;
/** After asking to stop, give up waiting for the browser's "end" after this. */
const END_GRACE_MS = 1500;

/**
 * Starts listening. `onText` gets the words so far; `onEnd` runs exactly once when listening stops,
 * with a message when it failed. Returns a function that stops listening.
 */
export function listen(
  onText: (text: string) => void,
  onEnd: (error: string | null) => void,
): () => void {
  const C = ctor();
  if (!C) {
    onEnd(`Voice input is not available in this browser. ${KEYBOARD_TIP}`);
    return () => undefined;
  }
  const rec = new C();
  rec.lang = 'en-IN';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let error: string | null = null;
  let heard = false;
  let ended = false;
  let silence = 0;
  let grace = 0;

  const finish = () => {
    if (ended) return;
    ended = true;
    window.clearTimeout(silence);
    window.clearTimeout(grace);
    window.clearTimeout(cap);
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    onEnd(error);
  };
  const stop = () => {
    if (ended) return;
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
    // If the browser never reports the end, finish anyway so the button does not stay on.
    window.clearTimeout(grace);
    grace = window.setTimeout(() => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      finish();
    }, END_GRACE_MS);
  };
  const cap = window.setTimeout(stop, MAX_MS);

  rec.onresult = (e) => {
    const segments: string[] = [];
    for (let i = 0; i < e.results.length; i += 1) segments.push(e.results[i]![0]?.transcript ?? '');
    const text = mergeTranscripts(segments);
    if (text) {
      heard = true;
      onText(text);
    }
    window.clearTimeout(silence);
    silence = window.setTimeout(stop, SILENCE_MS);
  };
  rec.onerror = (e) => {
    // Silence after something was heard is a normal end, not an error.
    error = e.error === 'no-speech' && heard ? null : message(e.error);
  };
  rec.onend = finish;

  try {
    rec.start();
  } catch {
    error = `Voice input could not start. ${KEYBOARD_TIP}`;
    finish();
  }
  return stop;
}
