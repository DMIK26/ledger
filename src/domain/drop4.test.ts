import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  categoryNameProblem,
  isDefaultCategory,
  makeCategory,
  recolor,
  reorder,
} from './categories';
import { parseCsv, safeText, toCsv, unsafeText } from './csv';
import {
  detectDateOrder,
  exportRows,
  guessMapping,
  parseCsvAmount,
  parseDateFlexible,
  parseMethod,
  planCsvImport,
  type ImportContext,
} from './csvImport';
import { buildInsights } from './insights';
import { minorToPlain } from './money';
import { customPeriod, periodFor, previousPeriod, sameLastYear, toDate } from './periods';
import { detectRecurring, occurrencesBetween, nextOccurrence, yearlyCost } from './recurring';
import { buildReport } from './reports';
import type { Transaction } from './types';

let n = 0;
const tx = (
  date: string,
  amountMinor: number,
  merchant = 'X',
  categoryId = 'food',
  over: Partial<Transaction> = {},
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
  source: 'form',
  createdAt: n,
  updatedAt: n,
  ...over,
});

describe('periods and the financial year boundary', () => {
  it('splits FY 2025-26 from FY 2026-27 between 31 March and 1 April', () => {
    expect(periodFor('fy', '2026-03-31')).toMatchObject({
      start: '2025-04-01',
      end: '2026-03-31',
      label: 'FY 2025-26',
    });
    expect(periodFor('fy', '2026-04-01')).toMatchObject({
      start: '2026-04-01',
      end: '2027-03-31',
      label: 'FY 2026-27',
    });
    expect(periodFor('fy', '2026-10-19', 4, -1).label).toBe('FY 2025-26');
  });

  it('uses financial-year quarters', () => {
    expect(periodFor('quarter', '2026-03-31')).toMatchObject({
      start: '2026-01-01',
      end: '2026-03-31',
      label: 'Q4 FY 2025-26 (Jan to Mar 2026)',
    });
    expect(periodFor('quarter', '2026-04-01')).toMatchObject({
      start: '2026-04-01',
      end: '2026-06-30',
    });
    expect(periodFor('quarter', '2026-10-19').label).toBe('Q3 FY 2026-27 (Oct to Dec 2026)');
    expect(periodFor('quarter', '2026-10-19', 4, -1).start).toBe('2026-07-01');
    // A January start gives calendar quarters and a plain year.
    expect(periodFor('quarter', '2026-10-19', 1).label).toBe('Q4 2026 (Oct to Dec 2026)');
    expect(periodFor('fy', '2026-10-19', 1)).toMatchObject({
      start: '2026-01-01',
      end: '2026-12-31',
      label: '2026',
    });
  });

  it('handles a quarter that crosses the year with a November start', () => {
    expect(periodFor('quarter', '2027-01-15', 11)).toMatchObject({
      start: '2026-11-01',
      end: '2027-01-31',
      label: 'Q1 FY 2026-27 (Nov 2026 to Jan 2027)',
    });
  });

  it('finds the previous period and the same period last year', () => {
    const oct = periodFor('month', '2026-10-19');
    expect(previousPeriod(oct)).toMatchObject({ start: '2026-09-01', end: '2026-09-30' });
    expect(sameLastYear(oct)).toMatchObject({ start: '2025-10-01', end: '2025-10-31' });
    const jan = periodFor('month', '2026-01-05');
    expect(previousPeriod(jan)).toMatchObject({ start: '2025-12-01', end: '2025-12-31' });
    const custom = customPeriod('2026-10-10', '2026-10-19');
    expect(previousPeriod(custom)).toMatchObject({ start: '2026-09-30', end: '2026-10-09' });
    expect(sameLastYear(customPeriod('2024-02-29', '2024-03-01'))).toMatchObject({
      start: '2023-02-28',
      end: '2023-03-01',
    });
  });

  it('compares a running period with the same number of days', () => {
    const oct = periodFor('month', '2026-10-19');
    expect(toDate(oct, previousPeriod(oct), '2026-10-19')).toEqual({
      end: '2026-10-19',
      compareEnd: '2026-09-19',
      partial: true,
    });
    expect(toDate(oct, previousPeriod(oct), '2026-11-02').partial).toBe(false);
  });
});

describe('reports', () => {
  const list = [
    tx('2026-10-01', 800000, 'Rent', 'housing', { method: 'Bank transfer' }),
    tx('2026-10-05', 20000, 'Chai'),
    tx('2026-10-12', 20000, 'chai'),
    tx('2026-10-12', 50000, 'Shawarma'),
    tx('2026-09-02', 600000, 'Rent', 'housing'),
    tx('2026-09-03', 40000, 'Chai'),
  ];
  it('totals, compares and breaks down a range', () => {
    const r = buildReport(
      list,
      { start: '2026-10-01', end: '2026-10-31' },
      { start: '2026-09-01', end: '2026-09-30' },
    );
    expect(r.totalMinor).toBe(890000);
    expect(r.compareMinor).toBe(640000);
    expect(r.changePct).toBe(39);
    expect(r.categories[0]).toMatchObject({
      categoryId: 'housing',
      totalMinor: 800000,
      compareMinor: 600000,
    });
    expect(r.categories[0]!.series).toEqual([0, 0, 0, 0, 600000, 800000]);
    expect(r.merchants[0]).toMatchObject({ merchant: 'Rent', count: 1 });
    expect(r.merchants.find((m) => m.merchant.toLowerCase() === 'chai')).toMatchObject({
      count: 2,
      totalMinor: 40000,
    });
    expect(r.methods.map((m) => m.method)).toEqual(['Bank transfer', 'UPI']);
    expect(r.days).toHaveLength(31);
    expect(r.days.reduce((s, d) => s + d.totalMinor, 0)).toBe(r.totalMinor);
    // Monday first. 5 and 12 Oct 2026 are Mondays; October has four.
    expect(r.weekdays[0]).toMatchObject({ weekday: 1, totalMinor: 90000, averageMinor: 22500 });
    expect(r.weekdays.reduce((s, w) => s + w.totalMinor, 0)).toBe(r.totalMinor);
  });
});

describe('csv', () => {
  it('reads quotes, doubled quotes, CRLF, BOM, semicolons and blank lines', () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n\r\n1,2\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['1', '2'],
    ]);
    expect(parseCsv('Date;Amount\n18/10/2026;500')).toEqual([
      ['Date', 'Amount'],
      ['18/10/2026', '500'],
    ]);
    expect(parseCsv('a,"line\nbreak"\n')).toEqual([['a', 'line\nbreak']]);
  });

  it('writes a BOM and CRLF and defuses spreadsheet formulas', () => {
    const text = toCsv([['Merchant'], [safeText('=HYPERLINK("x")')], ['a,b']]);
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toBe('\uFEFFMerchant\r\n"\'=HYPERLINK(""x"")"\r\n"a,b"\r\n');
    expect(unsafeText(safeText('-5 off'))).toBe('-5 off');
    expect(minorToPlain(123450)).toBe('1234.50');
  });
});

describe('csv import', () => {
  const ctx = (existing: Transaction[] = []): ImportContext => ({
    categories: DEFAULT_CATEGORIES,
    rules: {},
    existing,
    currency: 'INR',
    lastMethod: 'UPI',
    now: 1000,
    newId: (() => {
      let i = 0;
      return () => `new-${(i += 1)}`;
    })(),
    dateOrder: 'dmy',
  });

  it('guesses columns from common bank and spreadsheet headers', () => {
    expect(guessMapping(['Txn Date', 'Narration', 'Withdrawal Amt', 'Mode'])).toMatchObject({
      date: 0,
      merchant: 1,
      amount: 2,
      method: 3,
      category: -1,
    });
  });

  it('reads Indian and international dates and amounts', () => {
    expect(parseDateFlexible('18/10/2026')).toBe('2026-10-18');
    expect(parseDateFlexible('10/18/2026', 'mdy')).toBe('2026-10-18');
    expect(parseDateFlexible('18-10-26')).toBe('2026-10-18');
    expect(parseDateFlexible('18 Oct 2026')).toBe('2026-10-18');
    expect(parseDateFlexible('18-Oct-26')).toBe('2026-10-18');
    expect(parseDateFlexible('Oct 18, 2026')).toBe('2026-10-18');
    expect(parseDateFlexible('2026-10-18 14:02')).toBe('2026-10-18');
    expect(parseDateFlexible('31/09/2026')).toBeNull();
    expect(detectDateOrder(['01/02/2026', '13/02/2026'])).toBe('dmy');
    expect(detectDateOrder(['02/13/2026'])).toBe('mdy');
    expect(parseCsvAmount('₹1,200.50')).toBe(120050);
    expect(parseCsvAmount('Rs. 99')).toBe(9900);
    expect(parseCsvAmount('(500)')).toBe(-50000);
    expect(parseCsvAmount('250 Cr')).toBe(-25000);
    expect(parseCsvAmount('abc')).toBeNull();
    expect(parseMethod('GPay', 'Cash')).toBe('UPI');
    expect(parseMethod('', 'Cash')).toBe('Cash');
    expect(parseMethod('Cheque', 'Cash')).toBe('Other');
  });

  it('skips duplicates and income, reports bad rows, and creates unknown categories', () => {
    const existing = [tx('2026-10-18', 50000, 'Shawarma')];
    const rows = [
      ['18/10/2026', 'shawarma', '500', '', ''],
      ['19/10/2026', 'Uber', '240', 'Transport & Travel', 'card'],
      ['19/10/2026', 'Salary', '-50000', '', ''],
      ['32/10/2026', 'Bad', '10', '', ''],
      ['20/10/2026', 'Plants', '300', 'Garden', ''],
    ];
    const plan = planCsvImport(
      rows,
      { date: 0, merchant: 1, amount: 2, category: 3, method: 4, tags: -1, notes: -1 },
      ctx(existing),
    );
    expect(plan.duplicates).toBe(1);
    expect(plan.skippedIncome).toBe(1);
    expect(plan.errors.map((e) => e.row)).toEqual([5]);
    expect(plan.transactions.map((t) => [t.merchant, t.categoryId, t.method])).toEqual([
      ['Uber', 'transport', 'Card'],
      ['Plants', 'c-garden', 'UPI'],
    ]);
    expect(plan.newCategories).toMatchObject([{ id: 'c-garden', name: 'Garden' }]);
  });

  it('round-trips an export without losing anything, and a second import adds nothing', () => {
    const list = [
      tx('2026-10-18', 50050, '=SUM(A1)', 'food', {
        tags: ['work', 'trip'],
        notes: 'with "friends", late',
        method: 'Card',
      }),
      tx('2026-10-01', 800000, 'Rent', 'housing', { method: 'Bank transfer' }),
    ];
    const text = toCsv(exportRows(list, DEFAULT_CATEGORIES, safeText));
    const [header, ...rows] = parseCsv(text);
    const mapping = guessMapping(header!);
    const plan = planCsvImport(rows, mapping, ctx());
    const pick = (t: Transaction) => [
      t.date,
      t.amountMinor,
      t.merchant,
      t.categoryId,
      t.method,
      t.tags,
      t.notes,
    ];
    expect(plan.transactions.map(pick)).toEqual(list.map(pick));
    expect(plan.errors).toEqual([]);
    const again = planCsvImport(rows, mapping, ctx(plan.transactions));
    expect(again.transactions).toHaveLength(0);
    expect(again.duplicates).toBe(2);
  });
});

describe('recurring', () => {
  it('detects a monthly subscription and ignores irregular spending', () => {
    const list = [
      tx('2026-07-05', 64900, 'Netflix', 'entertainment'),
      tx('2026-08-05', 64900, 'Netflix', 'entertainment'),
      tx('2026-09-05', 64900, 'Netflix', 'entertainment'),
      tx('2026-10-05', 64900, 'Netflix', 'entertainment'),
      tx('2026-08-01', 20000, 'Chai'),
      tx('2026-08-20', 20000, 'Chai'),
      tx('2026-10-11', 20000, 'Chai'),
      tx('2026-10-01', 800000, 'Rent', 'housing'),
      tx('2026-09-01', 800000, 'Rent', 'housing'),
      tx('2026-08-01', 750000, 'Rent', 'housing'),
    ];
    const found = detectRecurring(list, '2026-10-19');
    expect(found.map((c) => [c.merchant, c.cadence, c.amountMinor])).toEqual([
      ['Rent', 'monthly', 800000],
      ['Netflix', 'monthly', 64900],
    ]);
    expect(
      detectRecurring(list, '2026-10-19', new Set(['netflix'])).map((c) => c.merchant),
    ).toEqual(['Rent']);
    // A subscription that stopped months ago is not current.
    expect(detectRecurring(list, '2027-03-01')).toEqual([]);
  });

  it('keeps the day of the month and clamps the 31st', () => {
    const item = { anchor: '2026-01-31', cadence: 'monthly' as const };
    expect(occurrencesBetween(item, '2026-02-01', 60)).toEqual(['2026-02-28', '2026-03-31']);
    expect(nextOccurrence({ anchor: '2026-10-05', cadence: 'weekly' }, '2026-10-19')).toBe(
      '2026-10-19',
    );
    expect(yearlyCost({ amountMinor: 64900, cadence: 'monthly' })).toBe(778800);
    expect(yearlyCost({ amountMinor: 10000, cadence: 'weekly' })).toBe(520000);
  });
});

describe('insights', () => {
  it('gives at most four, budget pace first', () => {
    const list = [
      tx('2026-09-03', 100000, 'Swiggy', 'food'),
      tx('2026-10-03', 300000, 'Swiggy', 'food'),
      tx('2026-10-04', 900000, 'Rent', 'housing'),
      tx('2026-10-05', 10000, 'Chai'),
      tx('2026-09-04', 300000, 'Uber', 'transport'),
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
    const out = buildInsights(list, '2026-10-19', 1_000_000, recurring);
    expect(out.map((i) => i.kind)).toEqual(['pace-over', 'category-up', 'upcoming', 'largest']);
    expect(out[1]).toMatchObject({ categoryId: 'food', deltaMinor: 210000, pct: 210 });
    expect(out[2]).toMatchObject({ merchant: 'Netflix', date: '2026-10-22' });
    expect(buildInsights([], '2026-10-19', null)).toEqual([]);
  });
});

describe('category manager rules', () => {
  it('protects default names, keeps colours unique and renumbers order', () => {
    expect(isDefaultCategory('food')).toBe(true);
    expect(categoryNameProblem('groceries', DEFAULT_CATEGORIES)).toMatch(/already/);
    expect(categoryNameProblem(' ', DEFAULT_CATEGORIES)).toMatch(/name/);
    const pets = makeCategory('Pets & vet', DEFAULT_CATEGORIES);
    expect(pets).toMatchObject({ id: 'c-pets-vet', order: 10 });
    const swapped = recolor(DEFAULT_CATEGORIES, 'food', DEFAULT_CATEGORIES[0]!.color);
    expect(new Set(swapped.map((c) => c.color)).size).toBe(10);
    expect(swapped.find((c) => c.id === 'housing')!.color).toBe(DEFAULT_CATEGORIES[1]!.color);
    const moved = reorder(DEFAULT_CATEGORIES, 'other', 0);
    expect(moved.map((c) => c.order)).toEqual([...Array(10).keys()]);
    expect(moved[0]!.id).toBe('other');
  });
});
