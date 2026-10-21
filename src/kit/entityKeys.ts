import { normalizeMerchantKey } from '../domain/categoriser';
import type { Transaction } from '../domain/types';

/**
 * Entity keys name things that can be highlighted together across the page: "category:food",
 * "merchant:swiggy", "method:Bank_transfer", "tag:work", "day:2026-10-18", "month:2026-10".
 * They contain no spaces, so `[data-entity~="key"]` can match one key in a list.
 */
export const entityKey = (kind: string, id: string): string =>
  `${kind}:${id.replace(/\s+/g, '_').replace(/["\\]/g, '')}`;

export const merchantKey = (merchant: string): string =>
  entityKey('merchant', normalizeMerchantKey(merchant) || 'untitled');

/** Every key one entry belongs to. */
export function txEntities(t: Transaction): string {
  return [
    entityKey('category', t.categoryId),
    merchantKey(t.merchant),
    entityKey('method', t.method),
    entityKey('day', t.date),
    entityKey('month', t.date.slice(0, 7)),
    ...t.tags.map((tag) => entityKey('tag', tag)),
  ].join(' ');
}
