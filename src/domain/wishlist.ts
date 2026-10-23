import { addDays, diffDays } from './dates';
import type { CategoryId, ISODate } from './types';
import type { Space } from './spaces';

/**
 * The wishlist: things you want, held for a wait before you decide. When the wait is over you buy it
 * (which logs the expense) or skip it; skipped prices add up as "saved by waiting".
 */

export const WAIT_DAYS = [7, 30] as const;
export type WaitDays = (typeof WAIT_DAYS)[number];

export type WishStatus = 'waiting' | 'bought' | 'skipped';

export interface WishItem {
  id: string;
  /** The Shop ledger's rows say 'shop'; missing means Personal (Drop 13). */
  space?: Space;
  name: string;
  priceMinor: number;
  /** Used when it is bought; guessed from the name when missing. */
  categoryId?: CategoryId;
  addedOn: ISODate;
  waitDays: WaitDays;
  note: string;
  status: WishStatus;
  decidedOn?: ISODate;
  /** The expense logged when it was bought. */
  txId?: string;
  createdAt: number;
  updatedAt: number;
}

export const MAX_WISH_NAME = 60;

export const readyOn = (w: Pick<WishItem, 'addedOn' | 'waitDays'>): ISODate =>
  addDays(w.addedOn, w.waitDays);

export const isReady = (w: Pick<WishItem, 'addedOn' | 'waitDays'>, today: ISODate): boolean =>
  today >= readyOn(w);

/** Whole days still to wait (0 once ready). */
export const daysToWait = (w: Pick<WishItem, 'addedOn' | 'waitDays'>, today: ISODate): number =>
  Math.max(0, diffDays(readyOn(w), today));

export interface WishlistSummary {
  /** Waiting items, the soonest ready first. */
  waiting: WishItem[];
  readyCount: number;
  waitingMinor: number;
  /** Decided items, newest decision first. */
  decided: WishItem[];
  savedByWaitingMinor: number;
  skippedCount: number;
  boughtCount: number;
}

export function wishlistSummary(items: readonly WishItem[], today: ISODate): WishlistSummary {
  const waiting = items
    .filter((w) => w.status === 'waiting')
    .sort((a, b) => readyOn(a).localeCompare(readyOn(b)) || a.createdAt - b.createdAt);
  const decided = items
    .filter((w) => w.status !== 'waiting')
    .sort(
      (a, b) => (b.decidedOn ?? '').localeCompare(a.decidedOn ?? '') || b.updatedAt - a.updatedAt,
    );
  const skipped = decided.filter((w) => w.status === 'skipped');
  return {
    waiting,
    readyCount: waiting.filter((w) => isReady(w, today)).length,
    waitingMinor: waiting.reduce((s, w) => s + w.priceMinor, 0),
    decided,
    savedByWaitingMinor: skipped.reduce((s, w) => s + w.priceMinor, 0),
    skippedCount: skipped.length,
    boughtCount: decided.length - skipped.length,
  };
}
