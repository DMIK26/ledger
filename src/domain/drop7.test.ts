import { describe, expect, it } from 'vitest';
import { installMode, isIOS } from './platform';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1',
  ipadAsMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 15; Pixel 7 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0 Mobile Safari/537.36',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36',
  firefoxDesktop: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
};

describe('install mode', () => {
  it('an installed app needs nothing', () => {
    expect(installMode({ ua: UA.androidChrome, standalone: true, canPrompt: true })).toBe(
      'installed',
    );
    expect(installMode({ ua: UA.iphoneSafari, standalone: true, canPrompt: false })).toBe(
      'installed',
    );
  });

  it('iPhone and iPad (even when it says Mac) install from Share > Add to Home Screen', () => {
    expect(installMode({ ua: UA.iphoneSafari, standalone: false, canPrompt: false })).toBe('ios');
    expect(installMode({ ua: UA.iphoneChrome, standalone: false, canPrompt: false })).toBe('ios');
    expect(isIOS(UA.ipadAsMac, 5)).toBe(true);
    expect(isIOS(UA.ipadAsMac, 0)).toBe(false);
  });

  it('in-app browsers are told to open Safari or Chrome', () => {
    expect(installMode({ ua: UA.instagram, standalone: false, canPrompt: false })).toBe('in-app');
    expect(installMode({ ua: UA.androidWebView, standalone: false, canPrompt: false })).toBe(
      'in-app',
    );
  });

  it('Chrome offers its own prompt; without one there is nothing to show (no dead Install button)', () => {
    expect(installMode({ ua: UA.androidChrome, standalone: false, canPrompt: true })).toBe(
      'prompt',
    );
    expect(installMode({ ua: UA.androidChrome, standalone: false, canPrompt: false })).toBe('none');
    expect(installMode({ ua: UA.firefoxDesktop, standalone: false, canPrompt: false })).toBe(
      'none',
    );
  });
});
