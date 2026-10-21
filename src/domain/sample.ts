import { budgetsForMonth, toBudgetRows, type MonthBudgets } from './budgets';
import { addDays, parseISO, shiftMonth } from './dates';
import type { RecurringItem } from './recurring';
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

  return { transactions, recurring, budgets };
}
