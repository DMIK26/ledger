import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listen, MAX_MS, SILENCE_MS, voiceMode } from './voice';

type Handler = ((e: unknown) => void) | null;

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: Handler = null;
  onend: (() => void) | null = null;
  onerror: Handler = null;
  stopped = 0;
  /** Like Safari on iPhone at times: stop() does not lead to an "end" event. */
  endsOnStop = true;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  stop() {
    this.stopped += 1;
    if (this.endsOnStop) this.onend?.();
  }
  abort() {}
  say(...segments: string[]) {
    this.onresult?.({
      results: segments.map((t) => Object.assign([{ transcript: t }], { isFinal: false })),
    });
  }
}

const w = window as unknown as Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  w.webkitSpeechRecognition = FakeRecognition;
});
afterEach(() => {
  vi.useRealTimers();
  delete w.webkitSpeechRecognition;
});

describe('listen', () => {
  it('turns Safari-style cumulative results into one clean line', () => {
    const texts: string[] = [];
    listen(
      (t) => texts.push(t),
      () => undefined,
    );
    const r = FakeRecognition.last!;
    expect(r.lang).toBe('en-IN');
    r.say('Chai');
    r.say('Chai', 'Chai 20');
    r.say('Chai', 'Chai 20', 'Chai 20 cash.');
    expect(texts.at(-1)).toBe('Chai 20 cash');
  });

  it('stops by itself after a pause, even when the browser never ends', () => {
    const onEnd = vi.fn();
    listen(() => undefined, onEnd);
    const r = FakeRecognition.last!;
    r.endsOnStop = false;
    r.say('chai 20 cash');
    vi.advanceTimersByTime(SILENCE_MS + 10);
    expect(r.stopped).toBe(1);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(null);
  });

  it('never listens longer than the cap, and ends exactly once', () => {
    const onEnd = vi.fn();
    listen(() => undefined, onEnd);
    vi.advanceTimersByTime(MAX_MS + 10);
    expect(FakeRecognition.last!.stopped).toBe(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    FakeRecognition.last!.onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('explains errors plainly and points to the keyboard mic', () => {
    const onEnd = vi.fn();
    listen(() => undefined, onEnd);
    const r = FakeRecognition.last!;
    r.onerror?.({ error: 'service-not-allowed' });
    r.onend?.();
    expect(onEnd.mock.calls[0]![0]).toMatch(/mic on your keyboard/);
  });

  it('a pause after words is not reported as "did not catch that"', () => {
    const onEnd = vi.fn();
    listen(() => undefined, onEnd);
    const r = FakeRecognition.last!;
    r.say('chai 20');
    r.onerror?.({ error: 'no-speech' });
    r.onend?.();
    expect(onEnd).toHaveBeenCalledWith(null);
  });
});

describe('voiceMode', () => {
  const setUA = (ua: string) =>
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  const setStandalone = (on: boolean) =>
    Object.defineProperty(navigator, 'standalone', { value: on, configurable: true });
  afterEach(() => {
    setUA('Mozilla/5.0 (X11; Linux x86_64) jsdom');
    setStandalone(false);
  });

  it('an iPhone home-screen app uses the keyboard mic; Safari in a tab listens', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1',
    );
    setStandalone(true);
    expect(voiceMode()).toBe('keyboard');
    setStandalone(false);
    expect(voiceMode()).toBe('listen');
  });

  it('without the API there is no mic', () => {
    delete w.webkitSpeechRecognition;
    expect(voiceMode()).toBe('none');
  });
});
