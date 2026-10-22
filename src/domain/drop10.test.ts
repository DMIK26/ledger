import { describe, expect, it } from 'vitest';
import type { Account, Flow, MoneyData } from './accounts';
import {
  goalState,
  goalsSetAside,
  jarFill,
  monthlyNeed,
  nextYear,
  payFund,
  savedThisMonth,
  sortGoals,
  type Goal,
} from './goals';
import { loanStatus, type Loan } from './loans';
import { assetValueAt, netWorthAt, netWorthHistory, type Asset } from './networth';
import {
  billsLeft,
  budgetKindOf,
  categoriesAtRisk,
  effectiveBudget,
  forecastMonthEnd,
  monthReview,
  monthToClose,
  pacingSeries,
  safeToSpend,
  spendIndex,
} from './plan';
import type { RecurringItem } from './recurring';
import type { Budget, Category, Transaction } from './types';
import { daysToWait, isReady, readyOn, wishlistSummary, type WishItem } from './wishlist';
import { DEFAULT_CATEGORIES } from './categories';
import { buildInsights } from './insights';

const TODAY = '2026-10-19'; // day 19 of 31

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

const rec = (
  id: string,
  merchant: string,
  amountMinor: number,
  anchor: string,
  categoryId = 'housing',
  cadence: RecurringItem['cadence'] = 'monthly',
): RecurringItem => ({
  id,
  merchant,
  categoryId,
  method: 'UPI',
  amountMinor,
  cadence,
  anchor,
  createdAt: 0,
});

const budget = (month: string, scope: string, amountMinor: number): Budget => ({
  id: `${month}|${scope}`,
  month,
  scope,
  amountMinor,
});

const october = [
  tx('2026-10-01', 1_500_000, 'Rent', 'housing'),
  tx('2026-10-05', 190_000, 'Swiggy'),
  tx('2026-10-19', 2_000, 'Chai'),
  tx('2026-10-02', 64_900, 'Netflix', 'entertainment'),
  tx('2026-10-25', 50_000, 'Gift', 'other'), // logged ahead
];
const recurring = [
  rec('n', 'Netflix', 64_900, '2026-09-02', 'entertainment'),
  rec('e', 'Electricity', 120_000, '2026-09-28'),
  rec('r', 'Rent', 1_500_000, '2026-09-01'),
  rec('m', 'Milk', 5_000, '2026-10-03', 'groceries', 'weekly'),
];

describe('budget types', () => {
  it('defaults Housing to fixed, Education to non-monthly and the rest to flexible', () => {
    expect(budgetKindOf('housing', DEFAULT_CATEGORIES)).toBe('fixed');
    expect(budgetKindOf('education', DEFAULT_CATEGORIES)).toBe('non-monthly');
    expect(budgetKindOf('food', DEFAULT_CATEGORIES)).toBe('flexible');
    expect(budgetKindOf('custom', [])).toBe('flexible');
    const cats: Category[] = [{ ...DEFAULT_CATEGORIES[1]!, budgetKind: 'fixed' }];
    expect(budgetKindOf('food', cats)).toBe('fixed');
  });
});

describe('bills still to come', () => {
  it('lists recurring payments after today this month, skipping ones already paid', () => {
    expect(billsLeft(recurring, october, TODAY).map((b) => `${b.item.merchant} ${b.date}`)).toEqual(
      ['Milk 2026-10-24', 'Electricity 2026-10-28', 'Milk 2026-10-31'],
    );
    // Electricity paid early this month is not counted again.
    const paid = [...october, tx('2026-10-18', 120_000, 'electricity', 'housing')];
    expect(billsLeft(recurring, paid, TODAY).map((b) => b.item.merchant)).toEqual(['Milk', 'Milk']);
    expect(billsLeft(recurring, october, '2026-10-31')).toEqual([]);
  });
});

describe('month-end forecast', () => {
  it('stretches only flexible spending and adds bills and entries logged ahead', () => {
    const f = forecastMonthEnd({
      transactions: october,
      categories: DEFAULT_CATEGORIES,
      recurring,
      today: TODAY,
    });
    expect(f).toEqual({
      spentMinor: 1_756_900,
      aheadMinor: 50_000,
      flexibleRateMinor: 10_105, // food only: rent is fixed, Netflix is a bill
      flexibleMoreMinor: 121_263,
      billsMinor: 130_000,
      totalMinor: 2_058_163,
    });
    expect(
      forecastMonthEnd({
        transactions: october,
        categories: DEFAULT_CATEGORIES,
        recurring,
        today: TODAY,
        categoryId: 'food',
      }).totalMinor,
    ).toBe(313_263);
  });

  it('drives the pace insight', () => {
    const out = buildInsights(october, TODAY, 2_000_000, recurring, DEFAULT_CATEGORIES);
    expect(out[0]).toEqual({ kind: 'pace-over', projectedMinor: 2_058_163, overMinor: 58_163 });
  });
});

describe('safe to spend today', () => {
  const base = {
    transactions: october,
    flows: [] as Flow[],
    budgets: [budget('2026-10', 'overall', 2_500_000)],
    categories: DEFAULT_CATEGORIES,
    recurring,
    goals: [] as Goal[],
    today: TODAY,
  };

  it('shares what is left after bills over the days left, including today', () => {
    expect(safeToSpend(base)).toEqual({
      source: 'budget',
      baseMinor: 2_500_000,
      spentBeforeMinor: 1_754_900,
      spentTodayMinor: 2_000,
      billsMinor: 180_000,
      goalsMinor: 0,
      availableMinor: 565_100,
      daysLeft: 13,
      perDayMinor: 43_400,
      todayLeftMinor: 41_400,
    });
  });

  it('grows when a day is underspent and shrinks when one goes over', () => {
    const today = safeToSpend(base).perDayMinor;
    expect(safeToSpend({ ...base, today: '2026-10-20' }).perDayMinor).toBeGreaterThan(today);
    const big = [...october, tx('2026-10-19', 200_000, 'Shoes', 'shopping')];
    expect(
      safeToSpend({ ...base, transactions: big, today: '2026-10-20' }).perDayMinor,
    ).toBeLessThan(today);
  });

  it('takes out what goals need this month', () => {
    const goal: Goal = {
      id: 'g',
      name: 'Phone',
      kind: 'goal',
      targetMinor: 1_200_000,
      startDate: '2026-10-01',
      dueDate: '2027-09-30',
      contributions: [],
      snoozed: [],
      createdAt: 0,
      updatedAt: 0,
    };
    const s = safeToSpend({ ...base, goals: [goal] });
    expect(s.goalsMinor).toBe(100_000);
    expect(s.perDayMinor).toBe(35_700);
  });

  it('uses money in without a budget, category budgets when there is no monthly one, and says when there is neither', () => {
    const income: Flow = {
      id: 'f',
      kind: 'income',
      date: '2026-10-01',
      amountMinor: 4_000_000,
      label: 'Salary',
      createdAt: 0,
      updatedAt: 0,
    };
    expect(safeToSpend({ ...base, budgets: [], flows: [income] })).toMatchObject({
      source: 'income',
      baseMinor: 4_000_000,
    });
    expect(
      safeToSpend({
        ...base,
        budgets: [budget('2026-10', 'food', 300_000), budget('2026-10', 'housing', 1_700_000)],
      }),
    ).toMatchObject({ source: 'budget', baseMinor: 2_000_000 });
    const none = safeToSpend({ ...base, budgets: [] });
    expect(none.source).toBe('none');
    expect(none.perDayMinor).toBe(0);
  });

  it('never goes below nothing a day', () => {
    const s = safeToSpend({ ...base, budgets: [budget('2026-10', 'overall', 1_000_000)] });
    expect(s.availableMinor).toBeLessThan(0);
    expect(s.perDayMinor).toBe(0);
    expect(s.todayLeftMinor).toBe(-2_000);
  });
});

describe('rollover', () => {
  const budgets = [
    budget('2026-08', 'food', 500_000),
    budget('2026-09', 'food', 500_000),
    budget('2026-10', 'food', 500_000),
  ];
  const spent = spendIndex([tx('2026-08-10', 400_000, 'A'), tx('2026-09-10', 650_000, 'B')]);

  it('carries what was left, or what went over, month to month', () => {
    const food = { id: 'food', rollover: true };
    expect(effectiveBudget(budgets, spent, '2026-09', food)).toEqual({
      baseMinor: 500_000,
      carryMinor: 100_000,
      totalMinor: 600_000,
    });
    expect(effectiveBudget(budgets, spent, '2026-10', food)).toEqual({
      baseMinor: 500_000,
      carryMinor: -50_000,
      totalMinor: 450_000,
    });
    expect(effectiveBudget(budgets, spent, '2026-08', food)?.carryMinor).toBe(0);
    expect(effectiveBudget(budgets, spent, '2026-10', { id: 'food' })?.carryMinor).toBe(0);
    expect(effectiveBudget(budgets, spent, '2026-11', food)).toBeNull();
  });
});

describe('pacing and categories at risk', () => {
  it('adds spending up day by day against a straight line', () => {
    const s = pacingSeries(
      [tx('2026-10-01', 100_000, 'A'), tx('2026-10-03', 50_000, 'B')],
      '2026-10',
      3_100_000,
      '2026-10-03',
    );
    expect(s).toHaveLength(31);
    expect(s.slice(0, 4).map((p) => [p.actualMinor, p.idealMinor])).toEqual([
      [100_000, 100_000],
      [100_000, 200_000],
      [150_000, 300_000],
      [null, 400_000],
    ]);
  });

  it('flags categories over budget, then those heading over', () => {
    const list = [...october, tx('2026-10-08', 150_000, 'Shoes', 'shopping')];
    const risks = categoriesAtRisk({
      transactions: list,
      budgets: [
        budget('2026-10', 'food', 300_000),
        budget('2026-10', 'shopping', 100_000),
        budget('2026-10', 'transport', 500_000),
      ],
      categories: DEFAULT_CATEGORIES,
      recurring,
      today: TODAY,
    });
    expect(risks.map((r) => [r.categoryId, r.kind])).toEqual([
      ['shopping', 'over'],
      ['food', 'at-risk'],
    ]);
    expect(risks[1]).toMatchObject({ spentMinor: 192_000, forecastMinor: 313_263 });
  });

  it('does not raise an alarm on the first days of a month', () => {
    expect(
      categoriesAtRisk({
        transactions: [tx('2026-10-01', 100_000, 'Dinner')],
        budgets: [budget('2026-10', 'food', 300_000)],
        categories: DEFAULT_CATEGORIES,
        recurring: [],
        today: '2026-10-02',
      }),
    ).toEqual([]);
  });
});

describe('close the month', () => {
  it('offers last month in the first week of this one, once', () => {
    expect(monthToClose('2026-11-03', [], october)).toBe('2026-10');
    expect(monthToClose('2026-11-03', ['2026-10'], october)).toBeNull();
    expect(monthToClose('2026-11-08', [], october)).toBeNull();
    expect(monthToClose('2026-12-03', [], october)).toBeNull();
  });

  it('sums up the month', () => {
    const r = monthReview({
      transactions: [...october, tx('2026-09-12', 1_000_000, 'Old', 'shopping')],
      flows: [
        {
          id: 'f',
          kind: 'income',
          date: '2026-10-01',
          amountMinor: 4_000_000,
          label: 'Salary',
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'g',
          kind: 'fee',
          date: '2026-10-09',
          amountMinor: 50_000,
          label: 'Late fee',
          createdAt: 0,
          updatedAt: 0,
        },
      ] as Flow[],
      budgets: [budget('2026-10', 'overall', 2_500_000), budget('2026-10', 'food', 300_000)],
      categories: [{ id: 'food', rollover: true }],
      month: '2026-10',
    });
    expect(r).toEqual({
      month: '2026-10',
      spentMinor: 1_806_900,
      entries: 5,
      budgetMinor: 2_500_000,
      inMinor: 4_000_000,
      outMinor: 1_856_900,
      top: { categoryId: 'housing', totalMinor: 1_500_000 },
      changePct: 81,
      carriedMinor: 108_000,
    });
  });
});

describe('goals and funds', () => {
  const goal = (over: Partial<Goal> = {}): Goal => ({
    id: 'g',
    name: 'Phone',
    kind: 'goal',
    targetMinor: 1_200_000,
    startDate: '2026-10-01',
    dueDate: '2027-09-30',
    contributions: [],
    snoozed: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  });
  const put = (date: string, amountMinor: number) => ({ id: date, date, amountMinor });

  it('works out the monthly amount and whether it is on track', () => {
    expect(monthlyNeed(goal(), TODAY)).toBe(100_000);
    expect(goalState(goal(), TODAY)).toBe('on-track');
    const one = goal({ contributions: [put('2026-10-05', 100_000)] });
    expect(goalState(one, TODAY)).toBe('on-track');
    expect(savedThisMonth(one, TODAY)).toBe(100_000);
    expect(monthlyNeed(one, TODAY)).toBe(100_000); // fixed at the start of the month
    expect(goalState(one, '2026-11-10')).toBe('on-track');
    expect(goalState(one, '2026-12-10')).toBe('at-risk');
    expect(monthlyNeed(one, '2026-12-10')).toBe(110_000);
    const more = goal({ contributions: [put('2026-10-05', 100_000), put('2026-11-02', 300_000)] });
    expect(goalState(more, '2026-11-10')).toBe('ahead');
    expect(jarFill(more)).toBeCloseTo(1 / 3);
  });

  it('snoozing a month spreads the amount over the rest without going at risk', () => {
    const g = goal({ snoozed: ['2026-10'] });
    expect(monthlyNeed(g, TODAY)).toBe(0);
    expect(monthlyNeed(g, '2026-11-05')).toBe(109_100);
    expect(goalState(g, '2026-11-05')).toBe('on-track');
  });

  it('is at risk once the date passes, and reached at the target', () => {
    const late = goal({ contributions: [put('2026-10-05', 1_100_000)] });
    expect(goalState(late, '2027-10-05')).toBe('at-risk');
    expect(monthlyNeed(late, '2027-10-05')).toBe(100_000);
    const done = goal({ contributions: [put('2026-10-05', 1_200_000)] });
    expect(goalState(done, TODAY)).toBe('done');
    expect(monthlyNeed(done, TODAY)).toBe(0);
  });

  it('a paid yearly fund starts again, keeping anything extra', () => {
    const fund = goal({
      kind: 'fund',
      name: 'Diwali',
      targetMinor: 2_000_000,
      dueDate: '2026-11-08',
      yearly: true,
      contributions: [put('2026-10-05', 2_100_000)],
    });
    expect(payFund(fund, '2026-11-07', 'x')).toMatchObject({
      startDate: '2026-11-07',
      dueDate: '2027-11-08',
      contributions: [{ id: 'x', date: '2026-11-07', amountMinor: 100_000 }],
      lastPaidOn: '2026-11-07',
    });
    const once = payFund({ ...fund, yearly: false }, '2026-11-07', 'x');
    expect(goalState(once, '2026-11-07')).toBe('paid');
    expect(monthlyNeed(once, '2026-11-07')).toBe(0);
    expect(nextYear('2028-02-29')).toBe('2029-02-28');
  });

  it('sets aside the larger of the need and what was put aside, and sorts open goals first', () => {
    const g = goal({ contributions: [put('2026-10-03', 150_000)] });
    const paid = goal({ id: 'p', paidOn: '2026-10-01', kind: 'fund' });
    expect(goalsSetAside([g, paid], TODAY)).toBe(150_000);
    const reached = goal({ id: 'r', contributions: [put('2026-10-01', 1_200_000)] });
    expect(sortGoals([paid, reached, g], TODAY).map((x) => x.id)).toEqual(['g', 'r', 'p']);
  });
});

describe('wishlist', () => {
  const wish = (over: Partial<WishItem>): WishItem => ({
    id: 'w',
    name: 'Headphones',
    priceMinor: 300_000,
    addedOn: '2026-10-10',
    waitDays: 7,
    note: '',
    status: 'waiting',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  });

  it('waits, then counts what skipping saved', () => {
    const a = wish({ id: 'a' });
    const b = wish({ id: 'b', addedOn: '2026-10-15', waitDays: 30 });
    expect(readyOn(a)).toBe('2026-10-17');
    expect(isReady(a, TODAY)).toBe(true);
    expect(isReady(b, TODAY)).toBe(false);
    expect(daysToWait(b, TODAY)).toBe(26);
    const s = wishlistSummary(
      [
        b,
        a,
        wish({ id: 'c', status: 'skipped', priceMinor: 500_000, decidedOn: '2026-10-01' }),
        wish({ id: 'd', status: 'bought', priceMinor: 200_000, decidedOn: '2026-10-02' }),
      ],
      TODAY,
    );
    expect(s.waiting.map((w) => w.id)).toEqual(['a', 'b']);
    expect(s.readyCount).toBe(1);
    expect(s.waitingMinor).toBe(600_000);
    expect(s.decided.map((w) => w.id)).toEqual(['d', 'c']);
    expect(s.savedByWaitingMinor).toBe(500_000);
    expect([s.skippedCount, s.boughtCount]).toEqual([1, 1]);
  });
});

describe('net worth', () => {
  const accounts: Account[] = [
    {
      id: 'bank',
      name: 'Bank',
      kind: 'bank',
      openingMinor: 1_000_000,
      openingDate: '2026-01-01',
      methods: ['UPI'],
      order: 0,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: 'card',
      name: 'Card',
      kind: 'card',
      openingMinor: 0,
      openingDate: '2026-01-01',
      methods: ['Card'],
      order: 1,
      createdAt: 0,
      updatedAt: 0,
    },
  ];
  const money: MoneyData = {
    transactions: [tx('2026-10-03', 300_000, 'Shoes', 'shopping', { method: 'Card' })],
    flows: [],
    udhaar: [
      {
        id: 'u1',
        personId: 'rahul',
        kind: 'lent',
        date: '2026-10-01',
        amountMinor: 50_000,
        note: '',
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: 'u2',
        personId: 'priya',
        kind: 'borrowed',
        date: '2026-10-02',
        amountMinor: 20_000,
        note: '',
        createdAt: 0,
        updatedAt: 0,
      },
    ],
  };
  const gold: Asset = {
    id: 'gold',
    name: 'Gold',
    kind: 'gold',
    values: [
      { date: '2026-09-30', valueMinor: 5_500_000 },
      { date: '2026-03-01', valueMinor: 5_000_000 },
    ],
    createdAt: 0,
    updatedAt: 0,
  };
  const loan: Loan = {
    id: 'l',
    name: 'Bike loan',
    lender: 'Bank',
    principalMinor: 10_000_000,
    rateBp: 1200,
    months: 12,
    firstDate: '2026-01-05',
    createdAt: 0,
    updatedAt: 0,
  };
  const input = { accounts, money, assets: [gold], loans: [loan] };

  it('adds accounts, assets and udhaar, and takes off cards and loans', () => {
    expect(assetValueAt(gold, '2026-02-01')).toBe(0);
    expect(assetValueAt(gold, '2026-09-29')).toBe(5_000_000);
    expect(netWorthAt(input, TODAY)).toEqual({
      accountsMinor: 1_000_000,
      cardsMinor: 300_000,
      assetsMinor: 5_500_000,
      owedToYouMinor: 50_000,
      youOweMinor: 20_000,
      loansMinor: 1_750_669,
      totalMinor: 4_479_331,
    });
    expect(netWorthAt(input, '2026-02-15').loansMinor).toBe(
      loanStatus(loan, '2026-02-15').remainingMinor,
    );
  });

  it('keeps month ends from the first month with anything in it', () => {
    const h = netWorthHistory(input, TODAY);
    expect(h).toHaveLength(11);
    expect(h[0]).toEqual({ month: '2025-12', date: '2025-12-31', totalMinor: -10_000_000 });
    expect(h[10]).toEqual({ month: '2026-10', date: TODAY, totalMinor: 4_479_331 });
    expect(
      netWorthHistory(
        { ...input, accounts: [], assets: [], loans: [], money: { ...money, udhaar: [] } },
        TODAY,
      ),
    ).toEqual([]);
  });
});
