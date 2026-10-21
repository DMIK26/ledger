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

export const speechSupported = (): boolean => ctor() !== null;

/**
 * Starts listening. `onText` gets the words so far; `onEnd` runs when listening stops, with an error
 * message when it failed. Returns a function that stops listening.
 */
export function listen(
  onText: (text: string) => void,
  onEnd: (error: string | null) => void,
): () => void {
  const C = ctor();
  if (!C) {
    onEnd('Voice input is not available in this browser.');
    return () => undefined;
  }
  const rec = new C();
  rec.lang = 'en-IN';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let error: string | null = null;
  rec.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i += 1) text += e.results[i]![0]!.transcript;
    onText(text.trim());
  };
  rec.onerror = (e) => {
    error =
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone permission is off. Allow it in the browser settings to speak entries.'
        : e.error === 'no-speech'
          ? 'Did not catch that. Try again.'
          : e.error === 'network'
            ? 'Voice input needs a connection in this browser.'
            : null;
  };
  rec.onend = () => onEnd(error);
  rec.start();
  return () => rec.stop();
}
