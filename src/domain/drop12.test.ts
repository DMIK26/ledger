import { describe, expect, it } from 'vitest';
import type { Flow } from './accounts';
import { DEFAULT_CATEGORIES } from './categories';
import { merchantStats } from './merchant';
import { fiftyThirtyTwenty, needOf } from './needs';
import { findNudges } from './nudges';
import { parseQuickEntry } from './parser';
import { relativePeriod } from './periods';
import { projectForDate, projectProblem, projectSummary, type Project } from './projects';
import type { RecurringItem } from './recurring';
import { forWhomNames, spentFor } from './forWhom';
import {
  applyRule,
  cleanRuleSet,
  firstRule,
  moveRule,
  ruleExtras,
  ruleProblem,
  testRule,
  type CustomRule,
} from './rules';
import { isEmptySearch, parseSearch, searchMatches, type SearchContext } from './search';
import {
  findSubcategory,
  makeSubcategory,
  subcategoryBreakdown,
  subcategoryInText,
  subcategoryName,
  subcategoryNameProblem,
} from './subcategories';
import { categoryTotals } from './aggregates';
import { taxCsvRows, taxSectionFromWord, taxSummary } from './tax';
import type { Category, Transaction } from './types';
import { warranties, warrantyEnd } from './warranties';

const TODAY = '2026-10-22'; // a Thursday

let n = 0;
const tx = (
  date: string,
  amountMinor: number,
  merchant: string,
  categoryId = 'food',
  extra: Partial<Transaction> = {},
): Transaction => ({
  id: `t${(n += 1)}`,
  date,
  amountMinor,
  currency: 'INR',
  merchant,
  categoryId,
  method: 'UPI',
  notes: '',
  tags: [],
  source: 'quick',
  createdAt: n,
  updatedAt: n,
  ...extra,
});

const flow = (date: string, amountMinor: number, kind: Flow['kind'] = 'income'): Flow => ({
  id: `f${(n += 1)}`,
  kind,
  date,
  amountMinor,
  label: 'Salary',
  createdAt: 0,
  updatedAt: 0,
});

const withSubs: Category[] = DEFAULT_CATEGORIES.map((c) =>
  c.id === 'food'
    ? {
        ...c,
        subcategories: [
          { id: 'food/coffee', name: 'Coffee' },
          { id: 'food/eating-out', name: 'Eating out' },
        ],
      }
    : c.id === 'groceries'
      ? { ...c, subcategories: [{ id: 'groceries/milk', name: 'Milk' }] }
      : c,
);

const rule = (over: Partial<CustomRule> = {}): CustomRule => ({
  id: `r${(n += 1)}`,
  match: 'contains',
  text: 'amazon',
  set: { categoryId: 'shopping' },
  createdAt: 0,
  ...over,
});

const ctx = (over: Partial<SearchContext> = {}): SearchContext => ({
  today: TODAY,
  fyStart: 4,
  categories: withSubs,
  projects: [{ id: 'p-goa', name: 'Goa' }],
  people: ['Amma', 'Shop'],
  ...over,
});

describe('plain-words search', () => {
  it('reads the roadmap example', () => {
    const q = parseSearch('food last month over 500 upi', ctx());
    expect(q.categoryIds).toEqual(['food']);
    expect(q.period).toEqual({ start: '2026-09-01', end: '2026-09-30', label: 'Last month' });
    expect(q.amount).toEqual({ kind: 'over', minor: 50000 });
    expect(q.methods).toEqual(['UPI']);
    expect(q.words).toEqual([]);
    const yes = tx('2026-09-12', 60000, 'Zomato');
    expect(searchMatches(yes, q)).toBe(true);
    expect(searchMatches({ ...yes, amountMinor: 50000 }, q)).toBe(false); // over is strict
    expect(searchMatches({ ...yes, method: 'Cash' }, q)).toBe(false);
    expect(searchMatches({ ...yes, date: '2026-10-01' }, q)).toBe(false);
    expect(searchMatches({ ...yes, categoryId: 'groceries' }, q)).toBe(false);
  });

  it('understands periods', () => {
    const p = (s: string) => parseSearch(s, ctx()).period;
    expect(p('today')).toMatchObject({ start: TODAY, end: TODAY });
    expect(p('yesterday')).toMatchObject({ start: '2026-10-21', end: '2026-10-21' });
    expect(p('this week')).toMatchObject({ start: '2026-10-19', end: '2026-10-25' });
    expect(p('last week')).toMatchObject({ start: '2026-10-12', end: '2026-10-18' });
    expect(p('this month')).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
    expect(p('last year')).toMatchObject({ start: '2025-01-01', end: '2025-12-31' });
    expect(p('this fy')).toMatchObject({ start: '2026-04-01', end: '2027-03-31' });
    expect(p('last financial year')).toMatchObject({ start: '2025-04-01', end: '2026-03-31' });
    expect(p('last 30 days')).toMatchObject({ start: '2026-09-23', end: TODAY });
    expect(p('last 2 weeks')).toMatchObject({ start: '2026-10-09', end: TODAY });
    expect(p('last 3 months')).toMatchObject({ start: '2026-08-01', end: TODAY });
    expect(p('september')).toMatchObject({ start: '2026-09-01', end: '2026-09-30' });
    // A month later in the year than today means last year's.
    expect(p('dec')).toMatchObject({ start: '2025-12-01', end: '2025-12-31' });
    expect(p('oct 2025')).toMatchObject({ start: '2025-10-01', end: '2025-10-31' });
    expect(p('18 oct')).toMatchObject({ start: '2026-10-18', end: '2026-10-18' });
    expect(p('sep 5')).toMatchObject({ start: '2026-09-05', end: '2026-09-05' });
    expect(p('in 2025')).toMatchObject({ start: '2025-01-01', end: '2025-12-31' });
  });

  it('understands amounts', () => {
    const a = (s: string) => parseSearch(s, ctx()).amount;
    expect(a('under 200')).toEqual({ kind: 'under', minor: 20000 });
    expect(a('at least 1.5k')).toEqual({ kind: 'atLeast', minor: 150000 });
    expect(a('up to ₹2,000')).toEqual({ kind: 'atMost', minor: 200000 });
    expect(a('more than rs 300')).toEqual({ kind: 'over', minor: 30000 });
    expect(a('between 200 and 500')).toEqual({ kind: 'between', minor: 20000, to: 50000 });
    expect(a('500 to 200')).toEqual({ kind: 'between', minor: 20000, to: 50000 });
    expect(a('200-500')).toEqual({ kind: 'between', minor: 20000, to: 50000 });
    expect(a('>1000')).toEqual({ kind: 'over', minor: 100000 });
    expect(a('chai 20')).toEqual({ kind: 'exact', minor: 2000 });
    const q = parseSearch('between 200 and 500', ctx());
    expect(searchMatches(tx(TODAY, 20000, 'A'), q)).toBe(true);
    expect(searchMatches(tx(TODAY, 50001, 'A'), q)).toBe(false);
  });

  it('understands categories, subcategories, tags, people, trips, tax and flags', () => {
    const q = parseSearch('coffee #work for amma goa 80c receipt', ctx());
    expect(q.subcategoryIds).toEqual(['food/coffee']);
    expect(q.tags).toEqual(['work']);
    expect(q.forWhom).toEqual(['amma']);
    expect(q.projectIds).toEqual(['p-goa']);
    expect(q.taxSections).toEqual(['80C']);
    expect(q.flags).toEqual(['receipt']);
    expect(q.words).toEqual([]);
    expect(parseSearch('eating out', ctx()).subcategoryIds).toEqual(['food/eating-out']);
    expect(parseSearch('grocery', ctx()).categoryIds).toEqual(['groceries']);
    expect(parseSearch('food & dining', ctx()).categoryIds).toEqual(['food']);
    expect(parseSearch('for me', ctx()).forWhom).toEqual(['']);
    expect(parseSearch('80ccd(1b) tax', ctx()).taxSections).toEqual(['80CCD(1B)']);
    expect(parseSearch('goa trip', ctx()).words).toEqual([]);
    // "for" before someone unknown is just a word to skip.
    expect(parseSearch('gift for rahul', ctx()).words).toEqual(['gift', 'rahul']);

    const coffee = tx(TODAY, 12000, 'Blue Tokai', 'food', {
      subcategoryId: 'food/coffee',
      tags: ['work'],
      forWhom: 'Amma',
      projectId: 'p-goa',
      taxSection: '80C',
      hasReceipt: true,
    });
    expect(searchMatches(coffee, q)).toBe(true);
    expect(searchMatches({ ...coffee, hasReceipt: undefined }, q)).toBe(false);
    expect(searchMatches({ ...coffee, forWhom: undefined }, q)).toBe(false);
    expect(searchMatches({ ...coffee, forWhom: undefined }, parseSearch('for me', ctx()))).toBe(
      true,
    );
  });

  it('matches the remaining words against merchant, notes, typed text and tags', () => {
    const q = parseSearch('zomato birthday', ctx());
    expect(q.words).toEqual(['zomato', 'birthday']);
    const t = tx(TODAY, 90000, 'Zomato', 'food', { notes: "Ravi's birthday" });
    expect(searchMatches(t, q)).toBe(true);
    expect(searchMatches({ ...t, notes: '' }, q)).toBe(false);
    expect(isEmptySearch(parseSearch('  the  ', ctx()))).toBe(true);
    expect(isEmptySearch(q)).toBe(false);
  });
});

describe('your rules', () => {
  it('matches by text, amount and method, first rule wins', () => {
    const big = rule({ minMinor: 100000, set: { categoryId: 'business' } });
    const any = rule();
    const e = { merchant: 'Amazon Pay', amountMinor: 50000, method: 'UPI' as const };
    expect(firstRule([big, any], e)).toBe(any);
    expect(firstRule([big, any], { ...e, amountMinor: 120000 })).toBe(big);
    expect(firstRule([rule({ match: 'is' })], e)).toBeNull();
    expect(firstRule([rule({ match: 'starts', text: 'amazon' })], e)).not.toBeNull();
    expect(firstRule([rule({ method: 'Card' })], e)).toBeNull();
    expect(moveRule([big, any], any.id, -1).map((r) => r.id)).toEqual([any.id, big.id]);
  });

  it('applies what it sets and leaves form choices alone', () => {
    const r = rule({
      set: {
        categoryId: 'food',
        subcategoryId: 'food/coffee',
        tag: 'work',
        forWhom: 'Shop',
        taxSection: '80C',
      },
    });
    const t = tx(TODAY, 100, 'Amazon', 'other', { unsure: true, subcategoryId: 'x' });
    const after = applyRule(t, r, withSubs);
    expect(after).toMatchObject({
      categoryId: 'food',
      subcategoryId: 'food/coffee',
      tags: ['work'],
      forWhom: 'Shop',
      taxSection: '80C',
      unsure: false,
    });
    const extras = ruleExtras({ ...t, forWhom: 'Amma' }, r);
    expect(extras.categoryId).toBe('other');
    expect(extras.forWhom).toBe('Amma');
    expect(extras.taxSection).toBe('80C');
    expect(extras.tags).toEqual(['work']);
  });

  it('is tested on past entries before saving', () => {
    const r = rule();
    const list = [
      tx('2026-10-01', 100, 'Amazon', 'shopping'),
      tx('2026-10-02', 100, 'amazon prime', 'entertainment'),
      tx('2026-10-03', 100, 'Flipkart', 'shopping'),
    ];
    const test = testRule(r, list, DEFAULT_CATEGORIES);
    expect(test.matches).toBe(2);
    expect(test.changes).toHaveLength(1);
    expect(test.changes[0]!.after.categoryId).toBe('shopping');
  });

  it('says what is missing', () => {
    expect(ruleProblem({ text: ' ', set: { categoryId: 'food' } })).toMatch(/merchant/);
    expect(ruleProblem({ text: 'x', set: {} })).toMatch(/at least one/);
    expect(ruleProblem({ text: 'x', minMinor: 5, maxMinor: 1, set: { tag: 'a' } })).toMatch(
      /lowest/,
    );
    expect(cleanRuleSet({ tag: ' #Work Trip ', forWhom: '  amma  ', categoryId: '' })).toEqual({
      tag: 'work-trip',
      forWhom: 'amma',
    });
  });

  it('come first in quick add, before learned rules and built-in words', () => {
    const r = rule({ text: 'swiggy', set: { categoryId: 'business', tag: 'office' } });
    const p = parseQuickEntry('swiggy 500', {
      today: TODAY,
      rules: { swiggy: 'food' },
      customRules: [r],
    });
    expect(p.categoryId).toBe('business');
    expect(p.unsure).toBe(false);
    expect(p.ruleId).toBe(r.id);
    const without = parseQuickEntry('swiggy 500', { today: TODAY, rules: { swiggy: 'food' } });
    expect(without.categoryId).toBe('food');
    expect(without.ruleId).toBeUndefined();
  });
});

describe('subcategories', () => {
  it('are found by name in quick add', () => {
    const p = parseQuickEntry('coffee 120', { today: TODAY, categories: withSubs });
    expect(p).toMatchObject({ categoryId: 'food', subcategoryId: 'food/coffee', unsure: false });
    // A subcategory you made beats a built-in word ("milk" is a grocery word anyway here).
    const milk = parseQuickEntry('milk 60', { today: TODAY, categories: withSubs });
    expect(milk).toMatchObject({ categoryId: 'groceries', subcategoryId: 'groceries/milk' });
    // A learned rule for the merchant keeps its category.
    const ruled = parseQuickEntry('milk 60', {
      today: TODAY,
      categories: withSubs,
      rules: { milk: 'food' },
    });
    expect(ruled.categoryId).toBe('food');
    expect(ruled.subcategoryId).toBeUndefined();
    expect(
      subcategoryInText('eating out', withSubs, { categoryId: 'other', fromRule: false }),
    ).toEqual({
      categoryId: 'food',
      subcategoryId: 'food/eating-out',
    });
  });

  it('roll up into their category in every total', () => {
    const list = [
      tx('2026-10-05', 1000, 'Cafe', 'food', { subcategoryId: 'food/coffee' }),
      tx('2026-10-06', 3000, 'Thali', 'food'),
      tx('2026-10-07', 500, 'Milk', 'groceries', { subcategoryId: 'groceries/milk' }),
    ];
    const totals = categoryTotals(list, '2026-10');
    expect(totals.find((t) => t.categoryId === 'food')!.totalMinor).toBe(4000);
    const food = withSubs.find((c) => c.id === 'food')!;
    expect(subcategoryBreakdown(list, food)).toEqual([
      { id: 'food/coffee', name: 'Coffee', totalMinor: 1000, count: 1 },
      { id: null, name: 'No subcategory', totalMinor: 3000, count: 1 },
    ]);
    expect(subcategoryName(withSubs, list[0]!)).toBe('Coffee');
    expect(
      subcategoryName(withSubs, { categoryId: 'other', subcategoryId: 'food/coffee' }),
    ).toBeNull();
    expect(findSubcategory(withSubs, 'groceries/milk')?.category.id).toBe('groceries');
  });

  it('get unique ids and sensible names', () => {
    const food = withSubs.find((c) => c.id === 'food')!;
    expect(makeSubcategory('Coffee!', food).id).toBe('food/coffee-2');
    expect(makeSubcategory('Snacks', food)).toEqual({ id: 'food/snacks', name: 'Snacks' });
    expect(subcategoryNameProblem('coffee', food)).toMatch(/already/);
    expect(subcategoryNameProblem('', food)).toMatch(/name/);
    expect(subcategoryNameProblem('Coffee', food, 'food/coffee')).toBeNull();
  });
});

describe('nudges', () => {
  const recurring: RecurringItem[] = [
    {
      id: 'netflix',
      merchant: 'Netflix',
      categoryId: 'entertainment',
      method: 'Card',
      amountMinor: 49900,
      cadence: 'monthly',
      anchor: '2026-08-05',
      createdAt: 0,
    },
  ];

  it('finds unusual amounts, repeats, price rises and warranties ending', () => {
    const list = [
      tx('2026-07-01', 30000, 'Swiggy'),
      tx('2026-08-01', 40000, 'Swiggy'),
      tx('2026-09-01', 35000, 'Swiggy'),
      tx('2026-10-20', 120000, 'Swiggy'),
      tx('2026-10-18', 42000, 'Zomato'),
      tx('2026-10-19', 42000, 'Zomato'),
      tx('2026-08-05', 49900, 'Netflix', 'entertainment', { recurringId: 'netflix' }),
      tx('2026-09-05', 49900, 'Netflix', 'entertainment', { recurringId: 'netflix' }),
      tx('2026-10-05', 64900, 'Netflix', 'entertainment', { recurringId: 'netflix' }),
      tx('2025-11-10', 2500000, 'Phone', 'shopping', { warrantyMonths: 12 }),
    ];
    const nudges = findNudges({ transactions: list, recurring, today: TODAY, dismissed: [] });
    expect(nudges.map((x) => x.kind)).toEqual(['duplicate', 'unusual', 'price', 'warranty']);
    const unusual = nudges.find((x) => x.kind === 'unusual')!;
    expect(unusual).toMatchObject({ usualMinor: 35000, times: 3, merchantKey: 'swiggy' });
    const price = nudges.find((x) => x.kind === 'price')!;
    expect(price).toMatchObject({ fromMinor: 49900, toMinor: 64900, yearlyMinor: 180000 });
    const warranty = nudges.find((x) => x.kind === 'warranty')!;
    expect(warranty).toMatchObject({ ends: '2026-11-10', daysLeft: 19 });
    const again = findNudges({
      transactions: list,
      recurring,
      today: TODAY,
      dismissed: nudges.map((x) => x.id),
    });
    expect(again).toEqual([]);
  });

  it('stays quiet about small or old differences', () => {
    const list = [
      tx('2026-07-01', 5000, 'Chai point'),
      tx('2026-08-01', 5000, 'Chai point'),
      tx('2026-09-01', 5000, 'Chai point'),
      tx('2026-10-20', 15000, 'Chai point'), // three times, but only ₹100 more
      tx('2026-09-01', 42000, 'Zomato'),
      tx('2026-09-02', 42000, 'Zomato'), // a repeat, but weeks ago
    ];
    expect(findNudges({ transactions: list, recurring: [], today: TODAY, dismissed: [] })).toEqual(
      [],
    );
  });
});

describe('merchant pages', () => {
  it('sums up a merchant', () => {
    const list = [
      tx('2026-10-20', 30000, 'Swiggy', 'food', { method: 'Card' }),
      tx('2026-10-10', 20000, 'swiggy'),
      tx('2026-09-30', 10000, 'Swiggy'),
      tx('2026-10-11', 99999, 'Zomato'),
    ];
    const s = merchantStats('swiggy', list, TODAY)!;
    expect(s).toMatchObject({
      name: 'Swiggy',
      count: 3,
      totalMinor: 60000,
      averageMinor: 20000,
      thisMonthMinor: 50000,
      first: '2026-09-30',
      last: '2026-10-20',
      daysSinceLast: 2,
      everyDays: 10,
      usualCategoryId: 'food',
      usualMethod: 'UPI',
    });
    expect(s.months).toHaveLength(12);
    expect(s.months.at(-1)).toEqual({ month: '2026-10', totalMinor: 50000 });
    expect(s.months.at(-2)).toEqual({ month: '2026-09', totalMinor: 10000 });
    expect(merchantStats('nobody', list, TODAY)).toBeNull();
  });
});

describe('trips and projects', () => {
  const goa: Project = {
    id: 'goa',
    name: 'Goa',
    kind: 'trip',
    start: '2026-10-15',
    end: '2026-10-25',
    budgetMinor: 2000000,
    collect: true,
    createdAt: 0,
    updatedAt: 0,
  };

  it('collects entries by date', () => {
    expect(projectForDate([goa], '2026-10-20')?.id).toBe('goa');
    expect(projectForDate([goa], '2026-10-26')).toBeNull();
    expect(projectForDate([{ ...goa, collect: false }], '2026-10-20')).toBeNull();
    expect(projectForDate([{ ...goa, archived: true }], '2026-10-20')).toBeNull();
    const diwali: Project = { ...goa, id: 'diwali', start: '2026-10-18', end: '2026-11-10' };
    expect(projectForDate([goa, diwali], '2026-10-20')?.id).toBe('diwali');
  });

  it('adds up spending against the budget', () => {
    const list = [
      tx('2026-10-16', 500000, 'Hotel', 'transport', { projectId: 'goa' }),
      tx('2026-10-17', 150000, 'Shacks', 'food', { projectId: 'goa' }),
      tx('2026-10-17', 99, 'Elsewhere'),
    ];
    const s = projectSummary(goa, list, TODAY);
    expect(s).toMatchObject({
      spentMinor: 650000,
      count: 2,
      leftMinor: 1350000,
      days: 8,
      perDayMinor: 81250,
      status: 'on',
    });
    expect(s.byCategory[0]).toEqual({ categoryId: 'transport', totalMinor: 500000 });
    expect(projectSummary({ ...goa, start: undefined, end: undefined }, list, TODAY).status).toBe(
      'open',
    );
  });

  it('checks the form', () => {
    expect(projectProblem({ ...goa, name: ' ' }, [])).toMatch(/name/);
    expect(projectProblem({ ...goa, end: '2026-10-01' }, [])).toMatch(/before/);
    expect(projectProblem({ ...goa, end: undefined }, [])).toMatch(/first and last day/);
    expect(projectProblem(goa, [{ id: 'x', name: 'goa' }])).toMatch(/already/);
    expect(projectProblem(goa, [{ id: 'goa', name: 'Goa' }], 'goa')).toBeNull();
  });
});

describe('tax summary', () => {
  it('totals each section for the year against its limit', () => {
    const list = [
      tx('2026-05-01', 10000000, 'PPF', 'other', { taxSection: '80C' }),
      tx('2026-06-01', 8000000, 'LIC', 'other', { taxSection: '80C' }),
      tx('2026-07-01', 2000000, 'Star Health', 'health', { taxSection: '80D' }),
      tx('2026-03-31', 999, 'Last year', 'other', { taxSection: '80C' }),
      tx('2026-07-02', 500000, 'Temple', 'other', { taxSection: '80G', notes: 'Diwali' }),
    ];
    const s = taxSummary(list, { start: '2026-04-01', end: '2027-03-31' });
    expect(s.rows.map((r) => r.section.id)).toEqual(['80C', '80D', '80G']);
    expect(s.rows[0]).toMatchObject({
      totalMinor: 18000000,
      countedMinor: 15000000,
      overMinor: 3000000,
    });
    expect(s.rows[2]).toMatchObject({ totalMinor: 500000, countedMinor: 500000, overMinor: 0 });
    expect(s.countedMinor).toBe(15000000 + 2000000 + 500000);
    expect(s.entries).toBe(4);
    const csv = taxCsvRows(s, DEFAULT_CATEGORIES, (x) => x);
    expect(csv[0]).toEqual(['Section', 'Date', 'What', 'Category', 'Amount', 'Notes']);
    expect(csv).toContainEqual([
      '80C',
      '',
      'Total for 80C',
      '',
      '180000.00',
      'Limit 150000.00; counts 150000.00',
    ]);
    expect(csv).toContainEqual(['80G', '2026-07-02', 'Temple', 'Other', '5000.00', 'Diwali']);
    expect(taxSectionFromWord('24(b)')).toBe('24(b)');
    expect(taxSectionFromWord('80CCD1B')).toBe('80CCD(1B)');
    expect(taxSectionFromWord('80x')).toBeNull();
  });
});

describe('50/30/20', () => {
  it('splits money in into needs, wants and what was left', () => {
    const list = [
      tx('2026-10-01', 2000000, 'Rent', 'housing'),
      tx('2026-10-02', 600000, 'Dinners', 'food'),
      tx('2026-10-03', 400000, 'Shoes', 'shopping'),
    ];
    const r = fiftyThirtyTwenty({
      transactions: list,
      flows: [flow('2026-10-01', 5000000), flow('2026-10-04', 100000, 'fee')],
      categories: DEFAULT_CATEGORIES,
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(r).toMatchObject({
      inMinor: 5000000,
      needsMinor: 2100000,
      wantsMinor: 1000000,
      leftMinor: 1900000,
      pct: { needs: 42, wants: 20, left: 38 },
      base: 'income',
    });
    // Without money in, just the split of spending; a category can be moved to needs.
    const cats = DEFAULT_CATEGORIES.map((c) =>
      c.id === 'food' ? { ...c, need: 'need' as const } : c,
    );
    const s = fiftyThirtyTwenty({
      transactions: list,
      flows: [],
      categories: cats,
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(s).toMatchObject({
      base: 'spending',
      pct: { needs: 87, wants: 13, left: null },
      leftMinor: null,
    });
    expect(needOf({ id: 'groceries' })).toBe('need');
    expect(needOf({ id: 'entertainment' })).toBe('want');
  });
});

describe('warranties, spent for whom and relative ranges', () => {
  it('ends warranties on the right day', () => {
    expect(warrantyEnd('2026-01-31', 1)).toBe('2026-02-28');
    expect(warrantyEnd('2024-02-29', 12)).toBe('2025-02-28');
    expect(warrantyEnd('2026-10-22', 24)).toBe('2028-10-22');
    const list = [
      tx('2025-10-01', 1, 'Old phone', 'shopping', { warrantyMonths: 12 }), // ended 21 days ago
      tx('2025-01-01', 1, 'Ancient', 'shopping', { warrantyMonths: 6 }), // ended long ago
      tx('2026-10-01', 1, 'Fridge', 'shopping', { warrantyMonths: 24 }),
      tx('2026-09-01', 1, 'Mixer', 'shopping', { warrantyMonths: 2 }),
    ];
    const w = warranties(list, TODAY);
    expect(w.active.map((x) => x.tx.merchant)).toEqual(['Mixer', 'Fridge']);
    expect(w.active[0]).toMatchObject({ ends: '2026-11-01', daysLeft: 10 });
    expect(w.ended.map((x) => x.tx.merchant)).toEqual(['Old phone']);
  });

  it('totals spending per person', () => {
    const list = [
      tx('2026-10-01', 1000, 'A', 'food', { forWhom: 'Amma' }),
      tx('2026-10-02', 3000, 'B', 'food', { forWhom: 'amma' }),
      tx('2026-10-03', 2000, 'C'),
      tx('2026-10-04', 500, 'D', 'business', { forWhom: 'Shop' }),
      tx('2026-09-04', 9999, 'E', 'business', { forWhom: 'Shop' }),
    ];
    expect(spentFor(list, '2026-10-01', '2026-10-31')).toEqual([
      { name: 'Amma', totalMinor: 4000, count: 2 },
      { name: '', totalMinor: 2000, count: 1 },
      { name: 'Shop', totalMinor: 500, count: 1 },
    ]);
    expect(forWhomNames(list)).toEqual(['Amma', 'Shop']);
  });

  it('moves relative ranges with today', () => {
    expect(relativePeriod('last-30-days', TODAY)).toMatchObject({
      start: '2026-09-23',
      end: TODAY,
    });
    expect(relativePeriod('last-3-months', TODAY)).toMatchObject({
      start: '2026-08-01',
      end: TODAY,
      label: 'Last 3 months',
    });
    expect(relativePeriod('last-12-months', TODAY).start).toBe('2025-11-01');
    expect(relativePeriod('this-year', '2027-02-03')).toMatchObject({
      start: '2027-01-01',
      end: '2027-02-03',
    });
  });
});
