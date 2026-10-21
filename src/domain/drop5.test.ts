import { describe, expect, it } from 'vitest';
import { entityKey, merchantKey, txEntities } from '../kit/entityKeys';
import { nextIndex } from '../kit/roving';
import { atRest, SPRING, springStep } from '../kit/spring';
import { navSummary } from './navSummary';
import { applyPins, matchesPins, pinnedCategories, togglePin, type Pin } from './pins';
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
  source: 'form',
  createdAt: n,
  updatedAt: n,
  ...over,
});

const LIST = [
  tx({ merchant: 'Swiggy', tags: ['work'] }),
  tx({ merchant: 'Big Basket', categoryId: 'groceries', method: 'Card' }),
  tx({ merchant: 'Uber', categoryId: 'transport', method: 'Card', date: '2026-10-19' }),
  tx({ merchant: 'Swiggy', method: 'Card', date: '2026-10-19' }),
];

const pin = (kind: Pin['kind'], id: string): Pin => ({ kind, id, label: id });

describe('pins', () => {
  it('widen within a kind and narrow across kinds', () => {
    expect(applyPins(LIST, [pin('category', 'food')])).toHaveLength(2);
    expect(applyPins(LIST, [pin('category', 'food'), pin('category', 'groceries')])).toHaveLength(
      3,
    );
    expect(applyPins(LIST, [pin('category', 'food'), pin('method', 'Card')])).toHaveLength(1);
    expect(applyPins(LIST, [pin('merchant', 'big basket')]).map((t) => t.merchant)).toEqual([
      'Big Basket',
    ]);
    expect(applyPins(LIST, [pin('tag', 'work')])).toHaveLength(1);
    expect(applyPins(LIST, [pin('day', '2026-10-19')])).toHaveLength(2);
    expect(applyPins(LIST, [])).toHaveLength(4);
    expect(matchesPins(LIST[0]!, [pin('category', 'transport')])).toBe(false);
  });

  it('toggle on and off, and report pinned categories', () => {
    const one = togglePin([], pin('category', 'food'));
    expect(one).toHaveLength(1);
    expect(togglePin(one, pin('category', 'food'))).toHaveLength(0);
    expect(pinnedCategories([...one, pin('method', 'UPI')])).toEqual(['food']);
    expect(pinnedCategories([pin('method', 'UPI')])).toBeNull();
  });
});

describe('entity keys', () => {
  it('never contain spaces, so one attribute can list several', () => {
    expect(entityKey('method', 'Bank transfer')).toBe('method:Bank_transfer');
    expect(merchantKey('Big  Basket!')).toBe('merchant:big_basket');
    const keys = txEntities(
      tx({ merchant: 'Big Basket', tags: ['goa trip'], method: 'Bank transfer' }),
    ).split(' ');
    expect(keys).toEqual([
      'category:food',
      'merchant:big_basket',
      'method:Bank_transfer',
      'day:2026-10-18',
      'month:2026-10',
      'tag:goa_trip',
    ]);
  });
});

describe('spring', () => {
  it('settles on the target with at most 8% overshoot', () => {
    let s = { x: 0, v: 0 };
    let peak = 0;
    for (let i = 0; i < 120; i += 1) {
      s = springStep(s, 100, 1 / 60, SPRING);
      peak = Math.max(peak, s.x);
    }
    expect(peak).toBeLessThanOrEqual(108);
    expect(atRest(s, 100)).toBe(true);
  });

  it('stays stable through a long frame', () => {
    const s = springStep({ x: 0, v: 0 }, 100, 0.5);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x - 100)).toBeLessThan(20);
  });
});

describe('roving keys', () => {
  it('moves in a list and by week in a calendar grid', () => {
    expect(nextIndex(0, 'ArrowRight', 5)).toBe(1);
    expect(nextIndex(4, 'ArrowRight', 5)).toBe(4);
    expect(nextIndex(3, 'Home', 5)).toBe(0);
    expect(nextIndex(3, 'End', 5)).toBe(4);
    expect(nextIndex(3, 'Tab', 5)).toBeNull();
    expect(nextIndex(3, 'ArrowRight', 31, 7)).toBe(10);
    expect(nextIndex(3, 'ArrowLeft', 31, 7)).toBe(0);
    expect(nextIndex(3, 'ArrowDown', 31, 7)).toBe(4);
  });
});

describe('nav summary', () => {
  it('counts unsure entries, categories over budget and payments due this week', () => {
    const list = [...LIST, tx({ unsure: true, categoryId: 'other', merchant: 'Zorb' })];
    const budgets = [
      { id: '2026-10|food', month: '2026-10', scope: 'food', amountMinor: 50000 },
      { id: '2026-10|overall', month: '2026-10', scope: 'overall' as const, amountMinor: 300000 },
    ];
    const recurring = [
      {
        id: 'r',
        merchant: 'Netflix',
        categoryId: 'entertainment',
        method: 'Card' as const,
        amountMinor: 64900,
        cadence: 'monthly' as const,
        anchor: '2026-09-22',
        createdAt: 0,
      },
    ];
    const s = navSummary(list, budgets, recurring, '2026-10-19');
    expect(s).toMatchObject({
      unsure: 1,
      overCategories: 1,
      dueSoon: 1,
      entries: 5,
      monthMinor: 250000,
      budgetLeftMinor: 50000,
    });
    expect(s.next).toEqual({ merchant: 'Netflix', date: '2026-10-22', amountMinor: 64900 });
  });
});
