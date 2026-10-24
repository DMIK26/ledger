import { budgetsForMonth, toBudgetRows, type MonthBudgets } from './budgets';
import { addDays, parseISO, shiftMonth } from './dates';
import type { RecurringItem } from './recurring';
import type { Account, Flow } from './accounts';
import type { Goal } from './goals';
import type { Loan } from './loans';
import type { Asset } from './networth';
import type { Project } from './projects';
import type { Person, UdhaarEntry } from './udhaar';
import type { WishItem } from './wishlist';
import type { Budget, ISODate, PaymentMethod, Transaction } from './types';

/**
 * Sample data so a new user can see Ledger working: about three months of everyday spending in India,
 * a few subscriptions, and budgets for this month. Deterministic (same input, same output), so it is
 * testable. Every id starts with "sample-" so it can be removed again without touching real entries.
 */
export const SAMPLE_PREFIX = 'sample-';

export interface SampleData {
  transactions: Transaction[];
  recurring: RecurringItem[];
  /** Budgets for months that have none yet (real budgets are never replaced). */
  budgets: Budget[];
  /** One of everything else (Drop 13): accounts, money in, udhaar, a loan, goals, a wish, assets, a trip. */
  rows: SampleRows;
}

export interface SampleRows {
  accounts: Account[];
  flows: Flow[];
  people: Person[];
  udhaar: UdhaarEntry[];
  loans: Loan[];
  goals: Goal[];
  wishlist: WishItem[];
  assets: Asset[];
  projects: Project[];
}

export const isSampleId = (id: string): boolean => id.startsWith(SAMPLE_PREFIX);

/** A small seeded random generator (mulberry32), so the sample is the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Habit {
  merchant: string;
  categoryId: string;
  method: PaymentMethod;
  /** Rupees, low and high. */
  min: number;
  max: number;
  /** Chance on any given day. */
  daily: number;
  tags?: string[];
}

const HABITS: Habit[] = [
  { merchant: 'Chai', categoryId: 'food', method: 'Cash', min: 15, max: 40, daily: 0.55 },
  { merchant: 'Swiggy', categoryId: 'food', method: 'UPI', min: 180, max: 520, daily: 0.18 },
  { merchant: 'Zomato', categoryId: 'food', method: 'UPI', min: 200, max: 600, daily: 0.12 },
  {
    merchant: 'BigBasket',
    categoryId: 'groceries',
    method: 'UPI',
    min: 600,
    max: 2400,
    daily: 0.08,
  },
  {
    merchant: 'Vegetables',
    categoryId: 'groceries',
    method: 'Cash',
    min: 80,
    max: 260,
    daily: 0.2,
  },
  { merchant: 'Uber', categoryId: 'transport', method: 'UPI', min: 120, max: 420, daily: 0.14 },
  { merchant: 'Metro', categoryId: 'transport', method: 'UPI', min: 30, max: 60, daily: 0.25 },
  { merchant: 'Petrol', categoryId: 'transport', method: 'Card', min: 500, max: 1500, daily: 0.05 },
  { merchant: 'Amazon', categoryId: 'shopping', method: 'Card', min: 300, max: 3500, daily: 0.06 },
  {
    merchant: 'Apollo Pharmacy',
    categoryId: 'health',
    method: 'UPI',
    min: 150,
    max: 900,
    daily: 0.04,
  },
  {
    merchant: 'PVR',
    categoryId: 'entertainment',
    method: 'Card',
    min: 350,
    max: 900,
    daily: 0.03,
    tags: ['weekend'],
  },
  { merchant: 'Books', categoryId: 'education', method: 'UPI', min: 250, max: 800, daily: 0.02 },
  {
    merchant: 'Client lunch',
    categoryId: 'business',
    method: 'Card',
    min: 600,
    max: 1800,
    daily: 0.02,
    tags: ['work'],
  },
];

const RECURRING: Omit<RecurringItem, 'id' | 'anchor' | 'createdAt'>[] = [
  {
    merchant: 'Rent',
    categoryId: 'housing',
    method: 'Bank transfer',
    amountMinor: 1_800_000,
    cadence: 'monthly',
  },
  {
    merchant: 'Electricity',
    categoryId: 'housing',
    method: 'UPI',
    amountMinor: 145_000,
    cadence: 'monthly',
  },
  {
    merchant: 'Netflix',
    categoryId: 'entertainment',
    method: 'Card',
    amountMinor: 64_900,
    cadence: 'monthly',
  },
  {
    merchant: 'Jio recharge',
    categoryId: 'other',
    method: 'UPI',
    amountMinor: 34_900,
    cadence: 'monthly',
  },
  {
    merchant: 'Gym',
    categoryId: 'health',
    method: 'UPI',
    amountMinor: 150_000,
    cadence: 'monthly',
  },
];

/** Day of month each recurring payment falls on. */
const RECURRING_DAY = [1, 6, 12, 18, 3];

const SAMPLE_BUDGET: MonthBudgets = {
  overall: 4_500_000,
  categories: {
    housing: 2_000_000,
    food: 700_000,
    groceries: 600_000,
    transport: 400_000,
    shopping: 300_000,
    entertainment: 200_000,
  },
};

const pad = (n: number) => String(n).padStart(2, '0');

export function buildSample(today: ISODate, existingBudgets: readonly Budget[] = []): SampleData {
  const random = rng(20261021);
  const p = parseISO(today)!;
  const start = shiftMonth(p.y, p.m, -2);
  const first = `${start.y}-${pad(start.m)}-01`;
  const transactions: Transaction[] = [];
  let n = 0;
  const add = (date: ISODate, h: Omit<Habit, 'min' | 'max' | 'daily'>, amountMinor: number) => {
    n += 1;
    transactions.push({
      id: `${SAMPLE_PREFIX}tx-${n}`,
      date,
      amountMinor,
      currency: 'INR',
      merchant: h.merchant,
      categoryId: h.categoryId,
      method: h.method,
      notes: '',
      tags: h.tags ?? [],
      raw: `${h.merchant.toLowerCase()} ${amountMinor / 100} ${h.method.toLowerCase()}`,
      source: 'import',
      createdAt: 0,
      updatedAt: 0,
    });
  };

  for (let date = first; date <= today; date = addDays(date, 1)) {
    for (const h of HABITS) {
      if (random() >= h.daily) continue;
      const rupees = h.min + Math.round((random() * (h.max - h.min)) / 10) * 10;
      add(date, h, rupees * 100);
    }
    const d = parseISO(date)!.d;
    RECURRING.forEach((r, i) => {
      if (d === RECURRING_DAY[i]) add(date, r, r.amountMinor);
    });
  }

  const recurring: RecurringItem[] = RECURRING.map((r, i) => ({
    ...r,
    id: `${SAMPLE_PREFIX}rec-${i + 1}`,
    anchor: `${first.slice(0, 8)}${pad(RECURRING_DAY[i]!)}`,
    createdAt: 0,
  }));

  // This month and the two before get a budget, unless the user already set one for that month.
  const budgets: Budget[] = [];
  for (let k = 0; k < 3; k += 1) {
    const m = shiftMonth(p.y, p.m, -k);
    const month = `${m.y}-${pad(m.m)}`;
    const mine = budgetsForMonth(existingBudgets, month);
    if (mine.overall !== null || Object.keys(mine.categories).length > 0) continue;
    budgets.push(...toBudgetRows(month, SAMPLE_BUDGET));
  }

  // A weekend trip three weeks ago, with its own entries and budget.
  const tripStart = addDays(today, -24);
  const tripEnd = addDays(tripStart, 2);
  const tripId = `${SAMPLE_PREFIX}project-1`;
  const tripEntries: Array<[number, string, string, PaymentMethod, number]> = [
    [0, 'Bus to Gokarna', 'transport', 'UPI', 1_450_00],
    [0, 'Beach shack', 'food', 'Cash', 860_00],
    [1, 'Homestay', 'housing', 'Card', 3_200_00],
    [2, 'Scooter hire', 'transport', 'Cash', 700_00],
  ];
  for (const [day, merchant, categoryId, method, amountMinor] of tripEntries) {
    add(addDays(tripStart, day), { merchant, categoryId, method }, amountMinor);
    transactions[transactions.length - 1]!.projectId = tripId;
  }
  // Entries that show the extra fields: for someone, a tax deduction and a warranty.
  add(
    addDays(today, -40),
    { merchant: 'Star Health', categoryId: 'health', method: 'Bank transfer' },
    18_500_00,
  );
  Object.assign(transactions[transactions.length - 1]!, { taxSection: '80D', forWhom: 'Amma' });
  add(
    addDays(today, -50),
    { merchant: 'Croma', categoryId: 'shopping', method: 'Card' },
    14_990_00,
  );
  Object.assign(transactions[transactions.length - 1]!, {
    warrantyMonths: 12,
    notes: 'Mixer grinder',
  });
  add(
    addDays(today, -9),
    { merchant: 'School fees', categoryId: 'education', method: 'UPI' },
    4_500_00,
  );
  Object.assign(transactions[transactions.length - 1]!, { forWhom: 'Riya' });
  // One the categoriser was not sure of, for the Review screen.
  add(addDays(today, -2), { merchant: 'Ravi Stores', categoryId: 'other', method: 'UPI' }, 340_00);
  transactions[transactions.length - 1]!.unsure = true;

  const id = (kind: string, i = 1) => `${SAMPLE_PREFIX}${kind}-${i}`;
  const stamp = { createdAt: 0, updatedAt: 0 };
  const accounts: Account[] = [
    {
      id: id('account', 1),
      name: 'SBI savings',
      kind: 'bank',
      openingMinor: 85_000_00,
      openingDate: first,
      methods: ['UPI', 'Bank transfer'],
      order: 0,
      ...stamp,
    },
    {
      id: id('account', 2),
      name: 'Cash in hand',
      kind: 'cash',
      openingMinor: 3_000_00,
      openingDate: first,
      methods: ['Cash'],
      order: 1,
      ...stamp,
    },
    {
      id: id('account', 3),
      name: 'HDFC credit card',
      kind: 'card',
      openingMinor: 0,
      openingDate: first,
      methods: ['Card'],
      order: 2,
      statementDay: 15,
      dueDay: 5,
      limitMinor: 1_50_000_00,
      ...stamp,
    },
  ];
  const flows: Flow[] = [];
  for (let k = 2; k >= 0; k -= 1) {
    const m = shiftMonth(p.y, p.m, -k);
    const date = `${m.y}-${pad(m.m)}-01`;
    if (date > today) continue;
    flows.push({
      id: id('flow', flows.length + 1),
      kind: 'income',
      date,
      amountMinor: 75_000_00,
      label: 'Salary',
      incomeKind: 'salary',
      accountId: accounts[0]!.id,
      ...stamp,
    });
    flows.push({
      id: id('flow', flows.length + 1),
      kind: 'transfer',
      date: addDays(date, 2),
      amountMinor: 5_000_00,
      label: 'ATM withdrawal',
      accountId: accounts[0]!.id,
      toAccountId: accounts[1]!.id,
      ...stamp,
    });
  }
  flows.push({
    id: id('flow', flows.length + 1),
    kind: 'fee',
    date: addDays(today, -20),
    amountMinor: 236_00,
    label: 'Late fee',
    accountId: accounts[2]!.id,
    ...stamp,
  });

  const people: Person[] = [
    { id: id('person', 1), name: 'Rahul', createdAt: 0 },
    { id: id('person', 2), name: 'Priya', createdAt: 0 },
  ];
  const udhaar: UdhaarEntry[] = [
    {
      id: id('udhaar', 1),
      personId: people[0]!.id,
      kind: 'lent',
      date: addDays(today, -30),
      amountMinor: 5_000_00,
      note: 'Laptop repair',
      ...stamp,
    },
    {
      id: id('udhaar', 2),
      personId: people[0]!.id,
      kind: 'got-back',
      date: addDays(today, -10),
      amountMinor: 2_000_00,
      note: 'Part payment',
      ...stamp,
    },
    {
      id: id('udhaar', 3),
      personId: people[1]!.id,
      kind: 'borrowed',
      date: addDays(today, -6),
      amountMinor: 1_200_00,
      note: 'Concert tickets',
      ...stamp,
    },
  ];
  const loanStart = shiftMonth(p.y, p.m, -8);
  const loans: Loan[] = [
    {
      id: id('loan'),
      name: 'Bike loan',
      lender: 'HDFC Bank',
      principalMinor: 90_000_00,
      rateBp: 1050,
      months: 24,
      firstDate: `${loanStart.y}-${pad(loanStart.m)}-05`,
      ...stamp,
    },
  ];
  const yearStart = shiftMonth(p.y, p.m, -3);
  const yearOn = shiftMonth(p.y, p.m, 9);
  const goals: Goal[] = [
    {
      id: id('goal', 1),
      name: 'New phone',
      kind: 'goal',
      targetMinor: 40_000_00,
      startDate: `${yearStart.y}-${pad(yearStart.m)}-01`,
      dueDate: `${yearOn.y}-${pad(yearOn.m)}-01`,
      contributions: [
        { id: id('contribution', 1), date: addDays(today, -60), amountMinor: 6_000_00 },
        { id: id('contribution', 2), date: addDays(today, -25), amountMinor: 4_000_00 },
      ],
      snoozed: [],
      ...stamp,
    },
    {
      id: id('goal', 2),
      name: 'Car insurance',
      kind: 'fund',
      targetMinor: 18_000_00,
      startDate: `${yearStart.y}-${pad(yearStart.m)}-01`,
      dueDate: `${yearOn.y}-${pad(yearOn.m)}-15`,
      contributions: [
        { id: id('contribution', 3), date: addDays(today, -15), amountMinor: 3_000_00 },
      ],
      snoozed: [],
      yearly: true,
      ...stamp,
    },
  ];
  const wishlist: WishItem[] = [
    {
      id: id('wish', 1),
      name: 'Headphones',
      priceMinor: 3_499_00,
      categoryId: 'shopping',
      addedOn: addDays(today, -9),
      waitDays: 7,
      note: 'For the commute',
      status: 'waiting',
      ...stamp,
    },
    {
      id: id('wish', 2),
      name: 'Smartwatch',
      priceMinor: 8_999_00,
      categoryId: 'shopping',
      addedOn: addDays(today, -3),
      waitDays: 30,
      note: '',
      status: 'waiting',
      ...stamp,
    },
  ];
  const assets: Asset[] = [
    {
      id: id('asset', 1),
      name: 'Gold coins',
      kind: 'gold',
      values: [
        { date: first, valueMinor: 1_20_000_00 },
        { date: addDays(today, -5), valueMinor: 1_32_000_00 },
      ],
      ...stamp,
    },
    {
      id: id('asset', 2),
      name: 'SBI FD',
      kind: 'fd',
      values: [{ date: first, valueMinor: 2_00_000_00 }],
      ...stamp,
    },
  ];
  const projects: Project[] = [
    {
      id: tripId,
      name: 'Gokarna weekend',
      kind: 'trip',
      start: tripStart,
      end: tripEnd,
      budgetMinor: 8_000_00,
      collect: false,
      ...stamp,
    },
  ];

  return {
    transactions,
    recurring,
    budgets,
    rows: { accounts, flows, people, udhaar, loans, goals, wishlist, assets, projects },
  };
}
