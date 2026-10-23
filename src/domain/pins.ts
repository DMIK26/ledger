import { normalizeMerchantKey } from './categoriser';
import type { Transaction } from './types';
import { tl } from './i18n';

export type PinKind = 'category' | 'merchant' | 'method' | 'tag' | 'day';

export interface Pin {
  kind: PinKind;
  /** category id, normalised merchant key, method name, tag, or ISO date. */
  id: string;
  /** What the filter bar shows. */
  label: string;
}

export const PIN_KIND_LABEL: Record<PinKind, string> = {
  get category() {
    return tl('Category');
  },
  get merchant() {
    return tl('Merchant');
  },
  get method() {
    return tl('Paid by');
  },
  get tag() {
    return tl('Tag');
  },
  get day() {
    return tl('Day');
  },
};

export const samePin = (a: Pick<Pin, 'kind' | 'id'>, b: Pick<Pin, 'kind' | 'id'>): boolean =>
  a.kind === b.kind && a.id === b.id;

function matchesOne(t: Transaction, p: Pin): boolean {
  switch (p.kind) {
    case 'category':
      return t.categoryId === p.id;
    case 'merchant':
      return normalizeMerchantKey(t.merchant) === p.id;
    case 'method':
      return t.method === p.id;
    case 'tag':
      return t.tags.includes(p.id);
    case 'day':
      return t.date === p.id;
  }
}

/**
 * An entry passes when, for every kind that has pins, it matches at least one of them: pins of one
 * kind widen the view (Food or Groceries), pins of different kinds narrow it (Food and UPI).
 */
export function matchesPins(t: Transaction, pins: readonly Pin[]): boolean {
  const kinds = new Set(pins.map((p) => p.kind));
  for (const kind of kinds) {
    if (!pins.some((p) => p.kind === kind && matchesOne(t, p))) return false;
  }
  return true;
}

export function applyPins(list: readonly Transaction[], pins: readonly Pin[]): Transaction[] {
  return pins.length === 0 ? [...list] : list.filter((t) => matchesPins(t, pins));
}

/** Adds the pin, or removes it if it is already there. */
export function togglePin(pins: readonly Pin[], pin: Pin): Pin[] {
  return pins.some((p) => samePin(p, pin)) ? pins.filter((p) => !samePin(p, pin)) : [...pins, pin];
}

/** Category ids the pins limit the view to, or null when categories are not pinned. */
export function pinnedCategories(pins: readonly Pin[]): string[] | null {
  const ids = pins.filter((p) => p.kind === 'category').map((p) => p.id);
  return ids.length > 0 ? ids : null;
}
