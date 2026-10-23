import { useEffect, useMemo, useState } from 'react';
import { useLedger } from '../data/store';
import { billsDue } from '../domain/badge';
import { todayISO } from '../domain/dates';

/** The app icon badge (Drop 13), where the browser has one: installed apps on computers and iPhones. */

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export const badgeSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'setAppBadge' in navigator;

/** iPhones and iPads only show a badge when notifications are allowed. */
export const needsNotificationsForBadge = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1));

/** Keeps the badge at the number of bills due this week while Ledger is open; clears it when off. */
export function useAppBadge(): void {
  const on = useLedger((s) => s.settings.appBadge);
  const everything = useLedger((s) => s.everything);
  const [day, setDay] = useState(() => todayISO());
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible') setDay(todayISO());
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);
  const count = useMemo(
    () => (on ? billsDue(everything.recurring, everything.accounts, everything, day) : 0),
    [on, everything, day],
  );
  useEffect(() => {
    if (!badgeSupported()) return;
    const nav = navigator as BadgeNavigator;
    const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
    void done?.catch(() => {
      /* Not allowed here (no permission, or not installed): nothing to do. */
    });
  }, [count]);
}
