/**
 * How Ledger can be installed in the browser it is running in. Pure, so every case is tested.
 * - installed: already running as the installed app
 * - prompt: the browser offered an install prompt (Chrome and Edge on Android and desktop)
 * - ios: iPhone or iPad; installing is Share, then Add to Home Screen
 * - in-app: a browser inside another app (Instagram, Facebook, Gmail...), which cannot install
 * - none: nothing to offer (for example Firefox on a desktop)
 */
export type InstallMode = 'installed' | 'prompt' | 'ios' | 'in-app' | 'none';

const IN_APP =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|LinkedInApp|Twitter|Snapchat|MicroMessenger|GSA\/|; wv\)/i;

export function isIOS(ua: string, maxTouchPoints = 0): boolean {
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

export function installMode(opts: {
  ua: string;
  standalone: boolean;
  canPrompt: boolean;
  maxTouchPoints?: number;
}): InstallMode {
  if (opts.standalone) return 'installed';
  if (IN_APP.test(opts.ua)) return 'in-app';
  if (isIOS(opts.ua, opts.maxTouchPoints)) return 'ios';
  if (opts.canPrompt) return 'prompt';
  return 'none';
}
