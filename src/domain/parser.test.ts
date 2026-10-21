import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseQuickEntry } from './parser';

const TODAY = '2026-10-19'; // a Monday
const parse = (text: string, extra: Record<string, unknown> = {}) =>
  parseQuickEntry(text, { today: TODAY, lastMethod: 'Cash', ...extra });

describe('quick-add parser: the agreed test table (today = 19 Oct 2026)', () => {
  const rows: Array<[string, Partial<ReturnType<typeof parse>>]> = [
    ['shawarma 500 upi', { merchant: 'Shawarma', amountMinor: 50000, date: '2026-10-19', categoryId: 'food', method: 'UPI' }],
    ['shawarma 500 on 18th oct', { merchant: 'Shawarma', amountMinor: 50000, date: '2026-10-18' }],
    ['film 200 18th', { merchant: 'Film', amountMinor: 20000, date: '2026-10-18', categoryId: 'entertainment' }],
    ['taxi 340 5th sep', { date: '2026-09-05', categoryId: 'transport', amountMinor: 34000 }],
    ['rent 8000 1/9', { date: '2026-09-01', categoryId: 'housing', amountMinor: 800000 }],
    ['recharge 299 25th last month', { date: '2026-09-25', categoryId: 'housing', amountMinor: 29900 }],
    ['swiggy 1.5k 3 days ago', { amountMinor: 150000, date: '2026-10-16', categoryId: 'food' }],
    ['petrol 500 last friday', { date: '2026-10-16', categoryId: 'transport' }],
    ['xyzcorp 700', { categoryId: 'other', unsure: true, amountMinor: 70000 }],
  ];
  it.each(rows)('%s', (text, expected) => {
    expect(parse(text)).toMatchObject(expected);
  });

  it('rejects an impossible date and saves nothing', () => {
    const r = parse('lunch 150 31 sep');
    expect(r.errors).toContain('September has 30 days');
    expect(r.ok).toBe(false);
  });
});

describe('quick-add parser: dates', () => {
  it('uses a bare day in the current month and flags a future day as upcoming', () => {
    expect(parse('rent 8000 25th')).toMatchObject({ date: '2026-10-25', upcoming: true });
    expect(parse('film 200 18')).toMatchObject({ amountMinor: 20000, date: '2026-10-18', upcoming: false });
    expect(parse('film 200 on 18')).toMatchObject({ amountMinor: 20000, date: '2026-10-18' });
  });
  it('takes an earlier month only when named', () => {
    expect(parse('taxi 340 5 september').date).toBe('2026-09-05');
    expect(parse('taxi 340 sep 5').date).toBe('2026-09-05');
    expect(parse('taxi 340 18th').date).toBe('2026-10-18');
  });
  it('treats a far-future day and month as last year', () => {
    expect(parse('gift 900 28 dec').date).toBe('2025-12-28');
  });
  it('handles relative words and full dates', () => {
    expect(parse('chai 20 yesterday').date).toBe('2026-10-18');
    expect(parse('chai 20 day before yesterday').date).toBe('2026-10-17');
    expect(parse('chai 20 18/09/2026').date).toBe('2026-09-18');
    expect(parse('chai 20 2026-09-18').date).toBe('2026-09-18');
    expect(parse('chai 20 friday').date).toBe('2026-10-16');
    expect(parse('chai 20 last monday').date).toBe('2026-10-12');
  });
  it('never leaves date text in the merchant name', () => {
    expect(parse('shawarma on 18th oct 500').merchant).toBe('Shawarma');
    expect(parse('film 200 yesterday').merchant).toBe('Film');
  });
});

describe('quick-add parser: amounts and methods', () => {
  it('reads currency markers, commas, k and number words', () => {
    expect(parse('coffee ₹180 cash').amountMinor).toBe(18000);
    expect(parse('coffee rs 180').amountMinor).toBe(18000);
    expect(parse('coffee 180 rupees').amountMinor).toBe(18000);
    expect(parse('groceries 1,200.50').amountMinor).toBe(120050);
    expect(parse('flight 2k').amountMinor).toBe(200000);
    expect(parse('dinner two fifty').amountMinor).toBe(25000);
    expect(parse('lunch five hundred').amountMinor).toBe(50000);
  });
  it('never mistakes a date number for the amount', () => {
    expect(parse('rent 8000 1/9').amountMinor).toBe(800000);
    expect(parse('shawarma 500 on 18th oct').amountMinor).toBe(50000);
  });
  it('detects methods and falls back to the last-used one', () => {
    expect(parse('uber 250 gpay').method).toBe('UPI');
    expect(parse('lunch 150 cash').method).toBe('Cash');
    expect(parse('dinner 900 credit card')).toMatchObject({ method: 'Card', methodTyped: true });
    expect(parse('lunch 150')).toMatchObject({ method: 'Cash', methodTyped: false });
  });
});

describe('quick-add parser: categories', () => {
  it('lets a learned rule beat the built-in keywords', () => {
    expect(parse('film 200').categoryId).toBe('entertainment');
    expect(parse('film 200', { rules: { film: 'education' } })).toMatchObject({
      categoryId: 'education',
      confidence: 'rule',
    });
  });
  it('tolerates a one-letter typo', () => {
    expect(parse('shawerma 300')).toMatchObject({ categoryId: 'food', confidence: 'fuzzy' });
  });
  it('never defaults to Food & Dining', () => {
    expect(parse('qwertyuiop 300').categoryId).toBe('other');
  });
});

describe('quick-add parser: robustness', () => {
  it('never throws and only returns positive integer amounts', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = parse(s);
        if (r.amountMinor !== null) {
          expect(Number.isInteger(r.amountMinor)).toBe(true);
        }
        expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }),
      { numRuns: 300 },
    );
  });
});
