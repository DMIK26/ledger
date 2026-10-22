import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { kpis, lastMonths, samePointLastMonth } from './aggregates';
import { daysLeft } from './budgets';
import { evaluateAmount, looksLikeMaths } from './calc';
import {
  addDays,
  getMonthStartDay,
  monthBounds,
  monthKey,
  monthProgress,
  monthRangeLabel,
  setMonthStartDay,
} from './dates';
import { habitSummary, loggedDays, missedDays } from './habit';
import { periodFor } from './periods';
import { frequentEntries, repeatChips, type Favourite } from './repeat';
import type { Transaction } from './types';
import { categorise, normalizeMerchantKey } from './categoriser';
import { highlightSegments } from './highlight';
import { nativeDigits } from './indic';
import { parseQuickEntry } from './parser';

const TODAY = '2026-10-19'; // a Monday
const parse = (text: string) => parseQuickEntry(text, { today: TODAY, lastMethod: 'UPI' });
const value = (text: string) => {
  const r = evaluateAmount(text);
  return r.ok ? r.minor : r.error;
};

describe('amount maths', () => {
  it.each([
    ['250', 25000],
    ['250+120', 37000],
    ['250+120/2', 31000],
    ['3 x 45', 13500],
    ['3x45', 13500],
    ['3 × 45', 13500],
    ['3*45', 13500],
    ['100 ÷ 3', 3333],
    ['200/3', 6667],
    ['2k+500', 250000],
    ['1.5k - 250', 125000],
    ['1,200 + 300', 150000],
    ['10.50 + 0.25', 1075],
    ['500 − 50', 45000],
    ['12.5 x 4', 5000],
  ])('%s = %i paise', (text, minor) => {
    expect(value(text)).toBe(minor);
  });

  it('refuses division by zero, results at or below zero and half-written sums', () => {
    expect(value('20/0')).toBe('Cannot divide by zero');
    expect(value('100-100')).toBe('That sum comes to zero or less');
    expect(value('100-150')).toBe('That sum comes to zero or less');
    expect(value('250+')).toMatch(/Finish the sum/);
    expect(value('+250')).toMatch(/Finish the sum/);
    expect(value('2 apples')).toMatch(/cannot read/);
  });

  it('knows a sum when it sees one', () => {
    expect(looksLikeMaths('250+120')).toBe(true);
    expect(looksLikeMaths('3 x 45')).toBe(true);
    expect(looksLikeMaths('250')).toBe(false);
    expect(looksLikeMaths('chai 20')).toBe(false);
  });

  it('adding whole rupees is exact', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99999 }),
        fc.integer({ min: 1, max: 99999 }),
        (a, b) => {
          expect(value(`${a}+${b}`)).toBe((a + b) * 100);
          expect(value(`${a} x ${b}`)).toBe(a * b * 100);
        },
      ),
    );
  });
});

describe('quick add with maths', () => {
  it('works out the amount and leaves the rest alone', () => {
    const r = parse('chai 20+15 cash');
    expect(r).toMatchObject({ merchant: 'Chai', amountMinor: 3500, method: 'Cash', ok: true });
    const r2 = parse('groceries 250+120/2 yesterday');
    expect(r2).toMatchObject({ amountMinor: 31000, date: '2026-10-18', merchant: 'Groceries' });
    expect(parse('samosa 3 x 15').amountMinor).toBe(4500);
    expect(parse('₹2k+500 rent').amountMinor).toBe(250000);
  });

  it('keeps dates first: 18/9 is a date, not a division', () => {
    const r = parse('lunch 150 18/9');
    expect(r).toMatchObject({ amountMinor: 15000, date: '2026-09-18' });
    const r2 = parse('lunch 100+50 on 18th');
    expect(r2).toMatchObject({ amountMinor: 15000, date: '2026-10-18' });
  });

  it('a sum beats a lone day number', () => {
    expect(parse('auto 40+30 18')).toMatchObject({ amountMinor: 7000, date: '2026-10-18' });
  });

  it('a bad sum is an error and saves nothing', () => {
    const r = parse('chai 20/0');
    expect(r.errors).toContain('Cannot divide by zero');
    expect(r.ok).toBe(false);
  });

  it('highlights the whole sum as the amount', () => {
    const segs = highlightSegments(parse('chai 20+15 cash'));
    expect(segs.find((s) => s.kind === 'amount')?.text).toBe('20+15');
  });
});

describe('Telugu and Hindi quick add', () => {
  it('reads native digits without moving text positions', () => {
    expect(nativeDigits('चाय २०')).toBe('चाय 20');
    expect(nativeDigits('టీ ౧౫')).toBe('టీ 15');
    expect(nativeDigits('चाय २०').length).toBe('चाय २०'.length);
  });

  it.each([
    ['చాయ్ 20 నగదు', { amountMinor: 2000, method: 'Cash', categoryId: 'food', merchant: 'చాయ్' }],
    ['పాలు 60 నిన్న', { amountMinor: 6000, date: '2026-10-18', categoryId: 'groceries' }],
    ['కూరగాయలు రూ.150 మొన్న', { amountMinor: 15000, date: '2026-10-17', categoryId: 'groceries' }],
    ['అద్దె 8000 రూపాయలు', { amountMinor: 800000, categoryId: 'housing' }],
    ['మందులు ౨౫౦', { amountMinor: 25000, categoryId: 'health' }],
    ['चाय २० नकद', { amountMinor: 2000, method: 'Cash', categoryId: 'food', merchant: 'चाय' }],
    ['दूध 60 कल', { amountMinor: 6000, date: '2026-10-18', categoryId: 'groceries' }],
    ['सब्ज़ी 120 रुपये परसों', { amountMinor: 12000, date: '2026-10-17', categoryId: 'groceries' }],
    ['बिजली 1,450 आज', { amountMinor: 145000, date: '2026-10-19', categoryId: 'housing' }],
    [
      'dawai 250 kal',
      { amountMinor: 25000, date: '2026-10-18', categoryId: 'health', merchant: 'Dawai' },
    ],
    ['sabzi 80 nagadu', { amountMinor: 8000, method: 'Cash', categoryId: 'groceries' }],
    ['paalu 30 ninna', { date: '2026-10-18', categoryId: 'groceries' }],
    ['kiraya 9000', { categoryId: 'housing' }],
    ['battalu 1200 monna', { categoryId: 'shopping', date: '2026-10-17' }],
    ['petrol 500 aaj', { categoryId: 'transport', date: '2026-10-19', merchant: 'Petrol' }],
  ])('%s', (text, expected) => {
    expect(parse(text)).toMatchObject({ ...expected, ok: true });
  });

  it('keeps the script in the learned-rule key, and Latin keys as before', () => {
    expect(normalizeMerchantKey('చాయ్ దుకాణం')).toBe('చాయ్ దుకాణం');
    expect(normalizeMerchantKey('Café Coffee Day!')).toBe('caf coffee day');
    expect(normalizeMerchantKey('राम। जनरल')).toBe('राम जनरल');
    expect(categorise('రాము హోటల్', { 'రాము హోటల్': 'food' })).toEqual({
      categoryId: 'food',
      confidence: 'rule',
    });
  });

  it('does not take kal out of a longer word', () => {
    const r = parse('kalyan stores 300');
    expect(r.date).toBe(TODAY);
    expect(r.merchant).toBe('Kalyan Stores');
  });

  it('highlights script words', () => {
    const segs = highlightSegments(parse('चाय २० नकद'));
    expect(segs.filter((s) => s.kind).map((s) => [s.kind, s.text])).toEqual([
      ['category', 'चाय'],
      ['amount', '२०'],
      ['method', 'नकद'],
    ]);
  });
});

describe('missed days and kind streaks', () => {
  const days = (...list: string[]) => new Set(list);
  // Today is Mon 19 Oct 2026.

  it('asks about the last week only, never today or before the first entry', () => {
    const logged = days('2026-10-10', '2026-10-13', '2026-10-15', '2026-10-16');
    expect(missedDays(logged, TODAY)).toEqual([
      '2026-10-12',
      '2026-10-14',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(missedDays(days('2026-10-17'), TODAY)).toEqual(['2026-10-18']);
    expect(missedDays(days(TODAY), TODAY)).toEqual([]);
    expect(missedDays(days(), TODAY)).toEqual([]);
  });

  it('counts entries and no-spend marks as logged', () => {
    const logged = loggedDays([{ date: '2026-10-17' }], ['2026-10-18']);
    expect([...logged].sort()).toEqual(['2026-10-17', '2026-10-18']);
    expect(missedDays(logged, TODAY)).toEqual([]);
  });

  it('a run of logged days, today pending, and the 30-day count', () => {
    const logged = new Set<string>();
    for (let i = 1; i <= 10; i += 1) logged.add(addDays(TODAY, -i));
    const h = habitSummary(logged, TODAY)!;
    expect(h.run).toBe(10);
    expect(h.windowDays).toBe(10); // today not logged yet, so it does not count against you
    expect(h.loggedInWindow).toBe(10);
    logged.add(TODAY);
    expect(habitSummary(logged, TODAY)).toMatchObject({
      run: 11,
      windowDays: 11,
      loggedInWindow: 11,
    });
  });

  it('seven logged days earn a rest day that keeps the run going', () => {
    // 14 days logged, a gap, then 3 more: two rest days earned, one used.
    const logged = new Set<string>();
    for (let i = 18; i >= 5; i -= 1) logged.add(addDays(TODAY, -i));
    for (let i = 3; i >= 1; i -= 1) logged.add(addDays(TODAY, -i));
    const h = habitSummary(logged, TODAY)!;
    expect(h).toMatchObject({ run: 17, restUsed: 1, restSaved: 1 });
  });

  it('without a rest day saved, a missed day starts a new run', () => {
    const logged = new Set(['2026-10-14', '2026-10-15', '2026-10-17', '2026-10-18']);
    expect(habitSummary(logged, TODAY)).toMatchObject({ run: 2, restUsed: 0, restSaved: 0 });
  });

  it('never saves more than two rest days', () => {
    const logged = new Set<string>();
    for (let i = 40; i >= 1; i -= 1) logged.add(addDays(TODAY, -i));
    const h = habitSummary(logged, TODAY)!;
    expect(h.restSaved).toBe(2);
    expect(h).toMatchObject({ windowDays: 29, loggedInWindow: 29 });
  });
});

describe('repeat chips', () => {
  const tx = (
    id: string,
    date: string,
    merchant: string,
    amountMinor: number,
    extra: Partial<Transaction> = {},
  ): Transaction => ({
    id,
    date,
    amountMinor,
    currency: 'INR',
    merchant,
    categoryId: 'food',
    method: 'Cash',
    notes: '',
    tags: [],
    source: 'quick',
    createdAt: Number(id),
    updatedAt: Number(id),
    ...extra,
  });

  const history = [
    tx('1', '2026-10-01', 'Chai', 2000),
    tx('2', '2026-10-05', 'chai', 2000),
    tx('3', '2026-10-18', 'Chai', 2000),
    tx('4', '2026-10-02', 'Metro', 4000, { categoryId: 'transport', method: 'UPI' }),
    tx('5', '2026-10-09', 'Metro', 4000, { categoryId: 'transport', method: 'UPI' }),
    tx('6', '2026-10-16', 'Metro', 4000, { categoryId: 'transport', method: 'UPI' }),
    tx('7', '2026-10-17', 'Metro', 4000, { categoryId: 'transport', method: 'UPI' }),
    tx('8', '2026-10-12', 'Chai', 3000), // a different amount is a different chip
    tx('9', '2026-06-01', 'Old', 100), // outside 90 days
    tx('10', '2026-06-02', 'Old', 100),
    tx('11', '2026-06-03', 'Old', 100),
  ];

  it('finds entries logged three or more times in 90 days, most frequent first', () => {
    const f = frequentEntries(history, TODAY);
    expect(f.map((x) => [x.merchant, x.amountMinor, x.count])).toEqual([
      ['Metro', 4000, 4],
      ['Chai', 2000, 3],
    ]);
  });

  it('puts favourites first and does not repeat them', () => {
    const fav: Favourite = {
      id: 'f1',
      merchant: 'Chai',
      amountMinor: 2000,
      categoryId: 'food',
      method: 'Cash',
      tags: [],
      createdAt: 1,
    };
    const chips = repeatChips([fav], history, TODAY);
    expect(chips.map((c) => [c.merchant, c.favouriteId ?? null])).toEqual([
      ['Chai', 'f1'],
      ['Metro', null],
    ]);
    expect(repeatChips([], history, TODAY, 1)).toHaveLength(1);
  });
});

describe('month start day', () => {
  afterEach(() => setMonthStartDay(1));

  it('calendar months by default', () => {
    expect(monthKey('2026-10-19')).toBe('2026-10');
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRangeLabel('2026-10')).toBe('');
  });

  it('a late start day is named after the month it ends in', () => {
    setMonthStartDay(25);
    expect(monthKey('2026-10-24')).toBe('2026-10');
    expect(monthKey('2026-10-25')).toBe('2026-11');
    expect(monthKey('2026-12-30')).toBe('2027-01');
    expect(monthBounds('2026-11')).toEqual({ start: '2026-10-25', end: '2026-11-24' });
    expect(monthRangeLabel('2026-11')).toBe('25 Oct to 24 Nov');
    expect(monthProgress('2026-10-25')).toEqual({ day: 1, length: 31 });
  });

  it('an early start day is named after the month it starts in', () => {
    setMonthStartDay(5);
    expect(monthKey('2026-10-04')).toBe('2026-09');
    expect(monthKey('2026-10-05')).toBe('2026-10');
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-05', end: '2026-03-04' });
    expect(monthProgress('2026-03-04')).toEqual({ day: 28, length: 28 });
  });

  it('every day belongs to exactly the month whose bounds hold it', () => {
    for (const start of [1, 2, 15, 16, 28]) {
      setMonthStartDay(start);
      for (let i = 0; i < 400; i += 7) {
        const d = addDays('2026-01-01', i);
        const b = monthBounds(monthKey(d));
        expect(d >= b.start && d <= b.end).toBe(true);
      }
    }
  });

  it('clamps the setting to 1..28', () => {
    setMonthStartDay(31);
    expect(getMonthStartDay()).toBe(28);
    setMonthStartDay(0);
    expect(getMonthStartDay()).toBe(1);
  });

  it('KPIs, projections, suggestions and report months follow the cycle', () => {
    setMonthStartDay(25);
    const list = [
      { date: '2026-10-25', amountMinor: 10000 },
      { date: '2026-11-03', amountMinor: 20000 },
      { date: '2026-10-24', amountMinor: 99900 }, // previous cycle
      { date: '2026-09-25', amountMinor: 5000 }, // previous cycle, same point
    ].map((x, i) => ({
      id: String(i),
      currency: 'INR',
      merchant: 'X',
      categoryId: 'food',
      method: 'Cash' as const,
      notes: '',
      tags: [],
      source: 'quick' as const,
      createdAt: i,
      updatedAt: i,
      ...x,
    }));
    const k = kpis(list, '2026-11-03');
    expect(k).toMatchObject({ month: '2026-11', spentMinor: 30000, daysElapsed: 10 });
    expect(samePointLastMonth('2026-11-03')).toBe('2026-10-04'); // day 10 of the cycle from 25 Sep
    expect(daysLeft('2026-11-03')).toBe(21);
    expect(lastMonths('2026-11-03', 2)).toEqual(['2026-10', '2026-11']);
    expect(periodFor('month', '2026-11-03')).toMatchObject({
      start: '2026-10-25',
      end: '2026-11-24',
      label: 'November 2026',
    });
  });
});
