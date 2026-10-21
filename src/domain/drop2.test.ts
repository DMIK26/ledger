import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './categories';
import { findDuplicate } from './duplicates';
import {
  applyFilters,
  EMPTY_FILTERS,
  facetCounts,
  groupTransactions,
  isFiltered,
  pageCount,
  pageSlice,
  sortTransactions,
} from './filters';
import { minorToInput } from './money';
import { hashPin, isValidPin, verifyPin } from './pin';
import { fitWithin } from './receipts';
import { normalizeTag, parseTags } from './tags';
import type { Transaction } from './types';

let n = 0;
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: `t${(n += 1)}`,
  date: '2026-10-18',
  amountMinor: 50000,
  currency: 'INR',
  merchant: 'Shawarma',
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
  source: 'quick',
  createdAt: n,
  updatedAt: n,
  ...over,
});

const LIST = [
  tx({
    date: '2026-10-01',
    amountMinor: 800000,
    merchant: 'Rent',
    categoryId: 'housing',
    method: 'Bank transfer',
  }),
  tx({ date: '2026-10-18', amountMinor: 50000, merchant: 'Shawarma', tags: ['friends'] }),
  tx({
    date: '2026-10-18',
    amountMinor: 24000,
    merchant: 'Uber',
    categoryId: 'transport',
    method: 'Card',
    tags: ['work'],
  }),
  tx({
    date: '2026-09-25',
    amountMinor: 29900,
    merchant: 'Recharge',
    categoryId: 'housing',
    tags: ['work', 'friends'],
  }),
];

describe('filters', () => {
  it('filters by date range, category, method, tags and amount together', () => {
    expect(applyFilters(LIST, { ...EMPTY_FILTERS, from: '2026-10-01' })).toHaveLength(3);
    expect(applyFilters(LIST, { ...EMPTY_FILTERS, categories: ['housing'] })).toHaveLength(2);
    expect(
      applyFilters(LIST, { ...EMPTY_FILTERS, methods: ['Card'] }).map((t) => t.merchant),
    ).toEqual(['Uber']);
    expect(applyFilters(LIST, { ...EMPTY_FILTERS, tags: ['work'] })).toHaveLength(2);
    expect(
      applyFilters(LIST, { ...EMPTY_FILTERS, minMinor: 30000, maxMinor: 100000 }),
    ).toHaveLength(1);
    expect(
      applyFilters(LIST, { ...EMPTY_FILTERS, categories: ['housing'], to: '2026-09-30' }),
    ).toHaveLength(1);
    expect(isFiltered(EMPTY_FILTERS)).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTERS, tags: ['x'] })).toBe(true);
  });

  it('counts each facet against the other filters only', () => {
    const counts = facetCounts(LIST, { ...EMPTY_FILTERS, categories: ['housing'] });
    // Category counts ignore the category filter itself.
    expect(counts.categories).toEqual({ housing: 2, food: 1, transport: 1 });
    // Method and tag counts respect it.
    expect(counts.methods).toEqual({ 'Bank transfer': 1, UPI: 1 });
    expect(counts.tags).toEqual({ work: 1, friends: 1 });
  });

  it('sorts by date, amount and merchant in both directions', () => {
    expect(sortTransactions(LIST, { key: 'amount', dir: 'desc' })[0]?.merchant).toBe('Rent');
    expect(sortTransactions(LIST, { key: 'amount', dir: 'asc' })[0]?.merchant).toBe('Uber');
    expect(sortTransactions(LIST, { key: 'date', dir: 'asc' })[0]?.merchant).toBe('Recharge');
    expect(sortTransactions(LIST, { key: 'merchant', dir: 'asc' }).map((t) => t.merchant)).toEqual([
      'Recharge',
      'Rent',
      'Shawarma',
      'Uber',
    ]);
  });

  it('groups with subtotals that add up to the whole', () => {
    const groups = groupTransactions(LIST, 'category', DEFAULT_CATEGORIES);
    expect(groups.map((g) => g.label)).toEqual([
      'Housing & Utilities',
      'Food & Dining',
      'Transport & Travel',
    ]);
    expect(groups[0]?.totalMinor).toBe(829900);
    const sum = groups.reduce((s, g) => s + g.totalMinor, 0);
    expect(sum).toBe(LIST.reduce((s, t) => s + t.amountMinor, 0));
    expect(groupTransactions(LIST, 'day', DEFAULT_CATEGORIES)).toHaveLength(3);
    expect(groupTransactions(LIST, 'none', DEFAULT_CATEGORIES)).toHaveLength(1);
  });

  it('pages 15 rows at a time', () => {
    const many = Array.from({ length: 31 }, (_, i) => i);
    expect(pageCount(31)).toBe(3);
    expect(pageCount(0)).toBe(1);
    expect(pageSlice(many, 3)).toEqual([30]);
    expect(pageSlice(many, 9)).toEqual([30]);
  });
});

describe('duplicates', () => {
  it('flags the same merchant and amount within a day', () => {
    expect(
      findDuplicate({ date: '2026-10-19', amountMinor: 50000, merchant: 'shawarma' }, LIST)
        ?.merchant,
    ).toBe('Shawarma');
    expect(
      findDuplicate({ date: '2026-10-21', amountMinor: 50000, merchant: 'Shawarma' }, LIST),
    ).toBeNull();
    expect(
      findDuplicate({ date: '2026-10-18', amountMinor: 50100, merchant: 'Shawarma' }, LIST),
    ).toBeNull();
    const id = LIST[1]!.id;
    expect(
      findDuplicate({ date: '2026-10-18', amountMinor: 50000, merchant: 'Shawarma' }, LIST, id),
    ).toBeNull();
  });
});

describe('tags', () => {
  it('normalises and de-duplicates', () => {
    expect(normalizeTag('  #Goa Trip ')).toBe('goa-trip');
    expect(parseTags('Work, #work, trip, ,')).toEqual(['work', 'trip']);
  });
});

describe('amount field text', () => {
  it('drops .00 and keeps two decimals otherwise', () => {
    expect(minorToInput(50000)).toBe('500');
    expect(minorToInput(120050)).toBe('1200.50');
    expect(minorToInput(5)).toBe('0.05');
  });
});

describe('receipts', () => {
  it('scales the longest edge down to 1600px and never up', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1000, 3200)).toEqual({ width: 500, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('pin', () => {
  it('accepts 4 to 8 digits only', () => {
    expect(['1234', '12345678'].every(isValidPin)).toBe(true);
    expect(['123', '123456789', '12a4', ''].some(isValidPin)).toBe(false);
  });
  it('stores a salted hash that verifies only the right PIN', async () => {
    const a = await hashPin('2468', 1000);
    const b = await hashPin('2468', 1000);
    expect(a.hash).not.toContain('2468');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPin('2468', a)).toBe(true);
    expect(await verifyPin('2469', a)).toBe(false);
  });
});

describe('forgotten PIN reset', () => {
  it('waits exactly 24 hours and words the time left plainly', async () => {
    const { RESET_WAIT_MS, fmtWait, resetDue, resetRemaining } = await import('./pin');
    const at = 1_000_000;
    expect(resetDue(at, at + RESET_WAIT_MS - 1)).toBe(false);
    expect(resetDue(at, at + RESET_WAIT_MS)).toBe(true);
    // A clock moved backwards never shortens or lengthens the wait past 24 hours.
    expect(resetRemaining(at, at - 5_000)).toBe(RESET_WAIT_MS);
    expect(fmtWait(RESET_WAIT_MS)).toBe('about 24 hours');
    expect(fmtWait(90 * 60_000)).toBe('about 2 hours');
    expect(fmtWait(40 * 60_000)).toBe('about 40 minutes');
    expect(fmtWait(20_000)).toBe('less than a minute');
  });
});
