import { describe, expect, it } from 'vitest';
import type { Account, Flow } from './accounts';
import { calendarWeeks, sketchbookDays } from './calendar';
import { DEFAULT_CATEGORIES } from './categories';
import { dashboardOrder, DASHBOARD_CARDS, moveCard } from './dashboard';
import { moneyFlow } from './flow';
import { shouldLearn } from './learning';
import { merchantMatches, rankItems } from './palette';
import {
  buildRecap,
  dueRecap,
  guessMax,
  guessResult,
  lastFinancialYear,
  lastMonth,
  lastWeek,
} from './recap';
import type { RecurringItem } from './recurring';
import { averageWindow, buildReport, scaleCompare } from './reports';
import { groupBalances, shareAmounts, simplifyDebts, udhaarForSplit, type Split } from './splits';
import { squarify } from './treemap';
import type { Transaction } from './types';
import { wryLine, wryLines } from './wry';

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
  label: kind === 'income' ? 'Salary' : 'Late fee',
  incomeKind: kind === 'income' ? 'salary' : undefined,
  createdAt: 0,
  updatedAt: 0,
});

describe('calendar', () => {
  const recurring: RecurringItem[] = [
    {
      id: 'n',
      merchant: 'Netflix',
      categoryId: 'entertainment',
      method: 'Card',
      amountMinor: 64_900,
      cadence: 'monthly',
      anchor: '2026-09-22',
      createdAt: 0,
    },
    {
      id: 'm',
      merchant: 'Milk',
      categoryId: 'groceries',
      method: 'Cash',
      amountMinor: 5_000,
      cadence: 'weekly',
      anchor: '2026-10-03',
      createdAt: 0,
    },
  ];
  const card: Account = {
    id: 'sbi',
    name: 'SBI card',
    kind: 'card',
    openingMinor: 0,
    openingDate: '2026-01-01',
    methods: ['Card'],
    order: 0,
    dueDay: 25,
    createdAt: 0,
    updatedAt: 0,
  };

  it('lays the month out in Monday-first weeks with spending, bills, money in and card dues', () => {
    const weeks = calendarWeeks('2026-10', {
      transactions: [
        tx('2026-10-05', 30_000, 'Swiggy'),
        tx('2026-10-05', 20_000, 'DMart', 'groceries'),
      ],
      flows: [flow('2026-10-01', 4_000_000)],
      recurring,
      accounts: [card],
      noSpendDays: ['2026-10-07'],
      today: '2026-10-19',
    });
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]![0]).toMatchObject({ date: '2026-09-28', inMonth: false, day: 28 });
    expect(weeks[0]![3]).toMatchObject({ date: '2026-10-01', inMonth: true });
    const day = (d: string) => weeks.flat().find((c) => c.date === d)!;
    expect(day('2026-10-05')).toMatchObject({ spentMinor: 50_000, entries: 2 });
    expect(day('2026-10-01').income).toEqual([
      expect.objectContaining({ label: 'Salary', amountMinor: 4_000_000 }),
    ]);
    expect(day('2026-10-22').bills.map((b) => b.merchant)).toEqual(['Netflix']);
    expect(
      weeks
        .flat()
        .filter((c) => c.bills.some((b) => b.merchant === 'Milk'))
        .map((c) => c.date),
    ).toEqual(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31']);
    expect(day('2026-10-25').cardsDue).toEqual([{ id: 'sbi', name: 'SBI card' }]);
    expect(day('2026-10-07').noSpend).toBe(true);
    expect(day('2026-10-19').isToday).toBe(true);
  });

  it('fills a sketchbook page with each day’s biggest category', () => {
    const days = sketchbookDays(
      '2026-10',
      [tx('2026-10-05', 30_000, 'Swiggy'), tx('2026-10-05', 20_000, 'DMart', 'groceries')],
      ['2026-10-07'],
      '2026-10-19',
    );
    expect(days).toHaveLength(31);
    expect(days[4]).toEqual({ date: '2026-10-05', day: 5, kind: 'drawn', categoryId: 'food' });
    expect(days[5]!.kind).toBe('blank');
    expect(days[6]!.kind).toBe('rest');
    expect(days[24]!.kind).toBe('future');
  });
});

describe('the two-of-three learning rule', () => {
  const e = (categoryId: string, date: string) => ({ categoryId, date, createdAt: 0 });
  it('learns a first decision, and later only when two of the last three agree', () => {
    expect(
      shouldLearn({ categoryId: 'food', rule: 'food', decided: [e('food', '2026-10-01')] }),
    ).toBe(false);
    expect(
      shouldLearn({
        categoryId: 'shopping',
        rule: undefined,
        decided: [e('shopping', '2026-10-01')],
      }),
    ).toBe(true);
    expect(
      shouldLearn({
        categoryId: 'groceries',
        rule: 'food',
        decided: [e('food', '2026-10-01'), e('groceries', '2026-10-19'), e('food', '2026-10-10')],
      }),
    ).toBe(false);
    expect(
      shouldLearn({
        categoryId: 'groceries',
        rule: 'food',
        decided: [
          e('food', '2026-10-10'),
          e('groceries', '2026-10-19'),
          e('groceries', '2026-10-15'),
        ],
      }),
    ).toBe(true);
    // Only the last three count.
    expect(
      shouldLearn({
        categoryId: 'groceries',
        rule: 'food',
        decided: [
          e('groceries', '2026-09-01'),
          e('food', '2026-10-01'),
          e('food', '2026-10-10'),
          e('groceries', '2026-10-19'),
        ],
      }),
    ).toBe(false);
  });
});

describe('treemap', () => {
  it('fills the rectangle with near-square tiles whose areas match the values', () => {
    const items = [6, 6, 4, 3, 2, 2, 1].map((value, i) => ({ id: String(i), value }));
    const rects = squarify(items, 0, 0, 6, 4);
    expect(rects).toHaveLength(7);
    expect(rects[0]).toMatchObject({ x: 0, y: 0, w: 3, h: 2 });
    expect(rects[1]).toMatchObject({ x: 0, y: 2, w: 3, h: 2 });
    const area = rects.reduce((s, r) => s + r.w * r.h, 0);
    expect(area).toBeCloseTo(24);
    for (const r of rects) {
      expect(r.w * r.h).toBeCloseTo(r.value);
      expect(r.x + r.w).toBeLessThanOrEqual(6 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(4 + 1e-9);
    }
    expect(squarify([{ id: 'a', value: 0 }], 0, 0, 10, 10)).toEqual([]);
  });
});

describe('money flow', () => {
  const spending = [
    tx('2026-10-01', 1_500_000, 'Rent', 'housing'),
    tx('2026-10-05', 200_000, 'Swiggy'),
    tx('2026-10-06', 100_000, 'Zomato'),
    tx('2026-10-08', 200_000, 'Shoes', 'shopping'),
  ];
  const range = { start: '2026-10-01', end: '2026-10-31' };

  it('runs from money in to categories and what is left, and opens one category’s merchants', () => {
    const f = moneyFlow({
      transactions: spending,
      flows: [flow('2026-10-01', 4_000_000)],
      categories: DEFAULT_CATEGORIES,
      ...range,
      expand: 'food',
    });
    expect(f.nodes.map((x) => [x.id, x.valueMinor, x.column])).toEqual([
      ['in:salary', 4_000_000, 0],
      ['cat:housing', 1_500_000, 1],
      ['cat:food', 300_000, 1],
      ['cat:shopping', 200_000, 1],
      ['left', 2_000_000, 1],
      ['m:swiggy', 200_000, 2],
      ['m:zomato', 100_000, 2],
    ]);
    expect(f.links.find((l) => l.target === 'cat:housing')).toEqual({
      source: 'in:salary',
      target: 'cat:housing',
      valueMinor: 1_500_000,
    });
    expect(f.links.filter((l) => l.source === 'cat:food')).toHaveLength(2);
  });

  it('shows spending not covered by money in as its own source', () => {
    const none = moneyFlow({
      transactions: spending,
      flows: [],
      categories: DEFAULT_CATEGORIES,
      ...range,
    });
    expect(none.nodes[0]).toMatchObject({
      id: 'savings',
      label: 'Spending',
      valueMinor: 2_000_000,
    });
    const part = moneyFlow({
      transactions: spending,
      flows: [flow('2026-10-01', 1_000_000)],
      categories: DEFAULT_CATEGORIES,
      ...range,
    });
    expect(part.nodes[1]).toMatchObject({
      id: 'savings',
      label: 'Not covered by money in',
      valueMinor: 1_000_000,
    });
    expect(
      part.links.find((l) => l.source === 'in:salary' && l.target === 'cat:housing')?.valueMinor,
    ).toBe(750_000);
    expect(part.nodes.some((x) => x.id === 'left')).toBe(false);
  });

  it('groups categories after the sixth', () => {
    const many = DEFAULT_CATEGORIES.slice(0, 8).map((c, i) =>
      tx('2026-10-02', 10_000 * (10 - i), 'X', c.id),
    );
    const f = moneyFlow({
      transactions: many,
      flows: [],
      categories: DEFAULT_CATEGORIES,
      ...range,
    });
    expect(f.nodes.filter((x) => x.kind === 'category')).toHaveLength(6);
    expect(f.nodes.find((x) => x.id === 'cat:rest')?.valueMinor).toBe(40_000 + 30_000);
  });
});

describe('compare with the 12-month average', () => {
  it('takes the year before the range and scales it to the range’s days', () => {
    expect(averageWindow('2026-10-01')).toEqual({ start: '2025-10-01', end: '2026-09-30' });
    const list = [tx('2026-01-15', 3_650_000, 'Big'), tx('2026-10-05', 341_000, 'Now')];
    const win = averageWindow('2026-10-01');
    const r = scaleCompare(buildReport(list, { start: '2026-10-01', end: '2026-10-31' }, win), 31);
    expect(r.compareMinor).toBe(310_000);
    expect(r.changePct).toBe(10);
    expect(r.categories[0]!.compareMinor).toBe(310_000);
  });
});

describe('splits', () => {
  it('works out shares to the paisa in every mode', () => {
    const three = [
      { personId: null, value: 0 },
      { personId: 'a', value: 0 },
      { personId: 'b', value: 0 },
    ];
    expect(shareAmounts(1000, 'equal', three)).toEqual({ ok: true, shares: [334, 333, 333] });
    expect(
      shareAmounts(1000, 'exact', [
        { personId: null, value: 500 },
        { personId: 'a', value: 300 },
        { personId: 'b', value: 200 },
      ]),
    ).toEqual({ ok: true, shares: [500, 300, 200] });
    expect(
      shareAmounts(1000, 'exact', [
        { personId: null, value: 500 },
        { personId: 'a', value: 300 },
      ]),
    ).toEqual({
      ok: false,
      error: 'The amounts must add up to the total',
    });
    expect(
      shareAmounts(1001, 'percent', [
        { personId: null, value: 5000 },
        { personId: 'a', value: 2500 },
        { personId: 'b', value: 2500 },
      ]),
    ).toEqual({ ok: true, shares: [501, 250, 250] });
    expect(
      shareAmounts(1000, 'percent', [
        { personId: null, value: 5000 },
        { personId: 'a', value: 2000 },
      ]).ok,
    ).toBe(false);
    expect(
      shareAmounts(1000, 'shares', [
        { personId: null, value: 2 },
        { personId: 'a', value: 1 },
        { personId: 'b', value: 1 },
      ]),
    ).toEqual({ ok: true, shares: [500, 250, 250] });
    expect(shareAmounts(1000, 'equal', [{ personId: null, value: 0 }]).ok).toBe(false);
  });

  it('turns the others’ shares into udhaar, depending on who paid', () => {
    const parts = [
      { personId: null, value: 0, shareMinor: 334 },
      { personId: 'a', value: 0, shareMinor: 333 },
      { personId: 'b', value: 0, shareMinor: 333 },
    ];
    expect(udhaarForSplit({ paidBy: null, parts })).toEqual([
      { personId: 'a', kind: 'lent', amountMinor: 333 },
      { personId: 'b', kind: 'lent', amountMinor: 333 },
    ]);
    expect(udhaarForSplit({ paidBy: 'a', parts })).toEqual([
      { personId: 'a', kind: 'borrowed', amountMinor: 334 },
    ]);
  });

  it('nets open splits to the fewest transfers', () => {
    const split = (
      paidBy: string | null,
      total: number,
      shares: Array<[string | null, number]>,
    ): Split => ({
      totalMinor: total,
      mode: 'equal',
      paidBy,
      parts: shares.map(([personId, shareMinor]) => ({ personId, value: 0, shareMinor })),
      udhaarIds: [],
    });
    const balances = groupBalances([
      split(null, 900, [
        [null, 300],
        ['p1', 300],
        ['p2', 300],
      ]),
      split('p1', 600, [
        [null, 200],
        ['p1', 200],
        ['p2', 200],
      ]),
    ]);
    expect(Object.fromEntries(balances)).toEqual({ '': 400, p1: 100, p2: -500 });
    expect(simplifyDebts(balances)).toEqual([
      { from: 'p2', to: '', amountMinor: 400 },
      { from: 'p2', to: 'p1', amountMinor: 100 },
    ]);
  });
});

describe('story recap', () => {
  it('knows last week, last month and the last financial year', () => {
    expect(lastWeek('2026-10-21')).toMatchObject({
      id: 'week:2026-10-12',
      start: '2026-10-12',
      end: '2026-10-18',
      compareStart: '2026-10-05',
      compareEnd: '2026-10-11',
    });
    expect(lastMonth('2026-11-03')).toMatchObject({
      id: 'month:2026-10',
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(lastFinancialYear('2027-04-10', 4)).toMatchObject({
      id: 'fy:2026',
      start: '2026-04-01',
      end: '2027-03-31',
      label: 'FY 2026-27',
    });
  });

  it('offers each recap once, and only with entries in it', () => {
    const list = [tx('2026-10-05', 100, 'A'), tx('2026-10-28', 100, 'B')];
    expect(dueRecap('2026-11-03', [], list, 4)?.id).toBe('month:2026-10');
    expect(dueRecap('2026-11-03', ['month:2026-10'], list, 4)?.id).toBe('week:2026-10-26');
    expect(dueRecap('2026-11-03', ['month:2026-10', 'week:2026-10-26'], list, 4)).toBeNull();
    expect(dueRecap('2026-11-12', [], list, 4)).toBeNull();
  });

  it('builds the cards’ facts', () => {
    const r = buildRecap(
      lastMonth('2026-11-03'),
      [
        tx('2026-10-01', 1_500_000, 'Rent', 'housing'),
        tx('2026-10-05', 200_000, 'Swiggy'),
        tx('2026-10-12', 100_000, 'Swiggy'),
        tx('2026-10-12', 50_000, 'Uber', 'transport'),
        tx('2026-09-10', 1_000_000, 'Old', 'shopping'),
      ],
      [flow('2026-10-01', 4_000_000), flow('2026-10-09', 50_000, 'fee')],
      '2026-11-03',
    );
    expect(r).toMatchObject({
      totalMinor: 1_850_000,
      compareMinor: 1_000_000,
      changePct: 85,
      entries: 4,
      topCategory: { categoryId: 'housing', totalMinor: 1_500_000 },
      topMerchant: { name: 'Rent', totalMinor: 1_500_000, count: 1 },
      busiestDay: { date: '2026-10-01', totalMinor: 1_500_000 },
      quietDays: 28,
      biggest: { merchant: 'Rent', amountMinor: 1_500_000, date: '2026-10-01' },
      inMinor: 4_000_000,
      leftMinor: 2_100_000,
    });
  });

  it('scores a guess', () => {
    expect(guessResult(1_000_000, 1_000_000).verdict).toBe('spot-on');
    expect(guessResult(950_000, 1_000_000)).toEqual({
      diffMinor: -50_000,
      offPct: 5,
      verdict: 'close',
    });
    expect(guessResult(500_000, 1_000_000)).toMatchObject({ offPct: 50, verdict: 'under' });
    expect(guessResult(1_500_000, 1_000_000).verdict).toBe('over');
    expect(guessMax(1_850_000, 1_000_000)).toBe(3_700_000);
  });
});

describe('dashboard layout', () => {
  it('keeps the saved order and adds new cards in their default place', () => {
    expect(dashboardOrder([])).toEqual([...DASHBOARD_CARDS]);
    expect(dashboardOrder(['recent', 'safe', 'bogus'])).toEqual([
      'recent',
      'safe',
      'kpis',
      'budget',
      'risk',
      'cards',
      'nudges',
      'insights',
      'day',
      'charts',
      'sketchbook',
    ]);
    expect(moveCard(dashboardOrder([]), 'safe', -1)[0]).toBe('safe');
    expect(moveCard(dashboardOrder([]), 'kpis', -1).slice(0, 2)).toEqual(['kpis', 'safe']);
  });
});

describe('command palette', () => {
  const items = [
    { id: 'tx', label: 'Transactions', group: 'Go to', keywords: 'entries search' },
    { id: 'dark', label: 'Dark theme', group: 'Do', keywords: 'appearance' },
    { id: 'add', label: 'Add expense', group: 'Do' },
  ];
  it('matches word starts in labels, then keywords', () => {
    expect(rankItems(items, 'tra').map((i) => i.id)).toEqual(['tx']);
    expect(rankItems(items, 'theme').map((i) => i.id)).toEqual(['dark']);
    expect(rankItems(items, 'search').map((i) => i.id)).toEqual(['tx']);
    expect(rankItems(items, 'ad ex').map((i) => i.id)).toEqual(['add']);
    expect(rankItems(items, '').map((i) => i.id)).toEqual(['tx', 'dark', 'add']);
    expect(rankItems(items, 'zzz')).toEqual([]);
  });

  it('finds merchants, most used first', () => {
    const list = [
      tx('2026-10-01', 1, 'Swiggy'),
      tx('2026-10-02', 1, 'swiggy'),
      tx('2026-10-03', 1, 'Swiggy'),
      tx('2026-10-04', 1, 'Swiggy Instamart'),
      tx('2026-10-05', 1, 'Uber'),
    ];
    expect(merchantMatches(list, 'swi')).toEqual([
      { key: 'swiggy', name: 'Swiggy', count: 3 },
      { key: 'swiggy instamart', name: 'Swiggy Instamart', count: 1 },
    ]);
    expect(merchantMatches(list, 'inst').map((m) => m.name)).toEqual(['Swiggy Instamart']);
    expect(merchantMatches(list, '')).toEqual([]);
  });
});

describe('wry one-liners', () => {
  it('finds kind lines about the month, without amounts', () => {
    const chai = Array.from({ length: 9 }, (_, i) => tx(`2026-10-0${i + 1}`, 2_000, 'Chai Point'));
    const lines = wryLines({
      transactions: chai,
      categories: DEFAULT_CATEGORIES,
      noSpendDays: ['2026-10-10', '2026-10-11'],
      overallBudgetMinor: null,
      today: '2026-10-19',
    });
    expect(lines).toEqual([
      'Chai Point has seen you 9 times this month. It may know your order by now.',
      '2 no-spend days this month. Your wallet enjoyed the quiet.',
      '9 chai and coffee stops this month. Well caffeinated, well logged.',
      'Food & Dining is more than half of the month so far. It knows it is the favourite.',
    ]);
    expect(lines.join(' ')).not.toMatch(/₹|\d{3}/);
    expect(wryLine(lines, 5)).toBe(lines[1]);
    expect(wryLine([], 1)).toBeNull();
  });
});
