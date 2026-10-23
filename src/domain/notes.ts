import type { Category } from './types';
import { fmtDate, monthLabel } from './dates';
import { isPrivacyOn } from './money';
import { tl } from './i18n';

export const STAMPS = ['star', 'check', 'question', 'heart'] as const;
export type StampKind = (typeof STAMPS)[number];

export const STAMP_LABEL: Record<StampKind, string> = {
  get star() {
    return tl('Star');
  },
  get check() {
    return tl('Tick');
  },
  get question() {
    return tl('Question mark');
  },
  get heart() {
    return tl('Heart');
  },
};

/**
 * A note or stamp pinned to a thing on the page, not to a position: "tx:<id>", "category:<id>",
 * "month:YYYY-MM", "day:YYYY-MM-DD", "budget:overall" or "budget:<categoryId>". It shows wherever that
 * thing is drawn, so it follows the element when the page resizes or the month changes.
 */
export interface Note {
  id: string;
  anchor: string;
  /** The page it was written on, for the notes list. */
  page: string;
  text: string;
  stamp?: StampKind;
  createdAt: number;
  updatedAt: number;
}

export const MAX_NOTE_LENGTH = 280;

export const ANCHOR_KINDS = ['tx', 'category', 'month', 'day', 'budget', 'recurring'] as const;

export function parseAnchor(anchor: string): { kind: string; id: string } | null {
  const i = anchor.indexOf(':');
  if (i <= 0) return null;
  const kind = anchor.slice(0, i);
  if (!(ANCHOR_KINDS as readonly string[]).includes(kind)) return null;
  return { kind, id: anchor.slice(i + 1) };
}

/** Plain words for what a note is attached to. */
export function anchorLabel(
  anchor: string,
  categories: readonly Category[],
  merchantOf: (txId: string) => string | undefined = () => undefined,
): string {
  const a = parseAnchor(anchor);
  if (!a) return tl('Something that is gone');
  const cat = (id: string) => categories.find((c) => c.id === id)?.name ?? tl('a deleted category');
  switch (a.kind) {
    case 'tx':
      return merchantOf(a.id) ?? tl('A deleted entry');
    case 'category':
      return cat(a.id);
    case 'month':
      return monthLabel(a.id);
    case 'day':
      return fmtDate(a.id);
    case 'budget':
      return a.id === 'overall' ? tl('Monthly budget') : tl('{0} budget', cat(a.id));
    default:
      return tl('A recurring payment');
  }
}

/** Privacy mode hides numbers in what the user wrote too, since notes often carry amounts. */
export function noteText(text: string): string {
  return isPrivacyOn() ? text.replace(/\d[\d,.]*/g, '•••') : text;
}

export const cleanNote = (text: string): string => text.trim().slice(0, MAX_NOTE_LENGTH);
