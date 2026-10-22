import { describe, expect, it } from 'vitest';
import {
  accountForMethod,
  balances,
  cardStatus,
  cardsDueSoon,
  cashCheck,
  cashFlow,
  defaultMethods,
  incomeKindFor,
  lastDateOnDay,
  nextDateOnDay,
  type Account,
  type Flow,
  type MoneyData,
} from './accounts';
import { convertMinor, parseRate, rateAsMinor, rateInput } from './fx';
import {
  emiFor,
  loanStatus,
  parseRateBp,
  prepayEffect,
  rateText,
  schedule,
  type Loan,
} from './loans';
import { setPrivacy } from './money';
import { parseQuickEntry } from './parser';
import type { Transaction } from './types';
import {
  owedEffect,
  personBalance,
  reminderText,
  settleKind,
  udhaarSummary,
  udhaarTotals,
  type UdhaarEntry,
} from './udhaar';

const TODAY = '2026-10-19';

const account = (id: string, kind: Account['kind'], extra: Partial<Account> = {}): Account => ({
  id,
  name: id,
  kind,
  openingMinor: 0,
  openingDate: '2026-10-01',
  methods: [],
  order: 0,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const flow = (
  kind: Flow['kind'],
  date: string,
  amountMinor: number,
  extra: Partial<Flow> = {},
): Flow => ({
  id: `${kind}-${date}-${amountMinor}`,
  kind,
  date,
  amountMinor,
  label: kind,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const spend = (
  date: string,
  amountMinor: number,
  method: Transaction['method'],
  accountId?: string,
) => ({ date, amountMinor, method, accountId });

describe('accounts and balances', () => {
  const bank = account('bank', 'bank', {
    openingMinor: 5_000_000,
    methods: ['UPI', 'Bank transfer'],
    order: 0,
  });
  const cash = account('cash', 'cash', { openingMinor: 200_000, methods: ['Cash'], order: 1 });
  const card = account('card', 'card', {
    openingMinor: 1_000_000,
    methods: ['Card'],
    order: 2,
    statementDay: 5,
    dueDay: 25,
    limitMinor: 10_000_000,
  });
  const accounts = [bank, cash, card];

  it('gives new accounts the methods nobody has yet', () => {
    expect(defaultMethods('bank', [])).toEqual(['UPI', 'Bank transfer']);
    expect(defaultMethods('bank', [bank])).toEqual([]);
    expect(defaultMethods('cash', [bank])).toEqual(['Cash']);
    expect(defaultMethods('wallet', [])).toEqual([]);
    expect(accountForMethod(accounts, 'UPI')?.id).toBe('bank');
    expect(accountForMethod(accounts, 'Other')).toBeUndefined();
    const archivedFirst = [
      { ...bank, archived: true, order: 0 },
      { ...cash, methods: ['UPI' as const], order: 5 },
    ];
    expect(accountForMethod(archivedFirst, 'UPI')?.id).toBe('cash');
  });

  it('adds up spending, money in, transfers, fees, adjustments and udhaar from the opening date', () => {
    const data: MoneyData = {
      transactions: [
        spend('2026-10-02', 50_000, 'UPI'),
        spend('2026-10-03', 2_000, 'Cash'),
        spend('2026-10-04', 300_000, 'Card'),
        spend('2026-10-05', 10_000, 'UPI', 'cash'), // picked account wins over the method
        spend('2026-09-30', 99_999, 'UPI'), // before the opening date
        spend('2026-10-25', 77_777, 'UPI'), // after today
      ],
      flows: [
        flow('income', '2026-10-01', 4_000_000, { accountId: 'bank' }),
        flow('transfer', '2026-10-06', 500_000, { accountId: 'bank', toAccountId: 'card' }),
        flow('transfer', '2026-10-07', 100_000, { accountId: 'bank', toAccountId: 'cash' }),
        flow('fee', '2026-10-08', 45_000, { accountId: 'card' }),
        flow('adjust', '2026-10-09', -7_000, { accountId: 'cash' }),
      ],
      udhaar: [
        {
          id: 'u1',
          personId: 'p',
          kind: 'lent',
          date: '2026-10-10',
          amountMinor: 50_000,
          note: '',
          accountId: 'cash',
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    };
    expect(balances(accounts, data, TODAY)).toEqual({
      bank: 5_000_000 - 50_000 + 4_000_000 - 500_000 - 100_000,
      cash: 200_000 - 2_000 - 10_000 + 100_000 - 7_000 - 50_000,
      card: -1_000_000 - 300_000 + 500_000 - 45_000,
    });
  });

  it('works out a card statement, payments since, the due date and lateness', () => {
    const data: MoneyData = {
      transactions: [spend('2026-10-03', 300_000, 'Card'), spend('2026-10-10', 120_000, 'Card')],
      flows: [flow('transfer', '2026-10-12', 500_000, { accountId: 'bank', toAccountId: 'card' })],
      udhaar: [],
    };
    const s = cardStatus(card, accounts, data, TODAY);
    expect(s).toMatchObject({
      statementDate: '2026-10-05',
      statementMinor: 1_300_000,
      paidSinceMinor: 500_000,
      dueMinor: 800_000,
      dueDate: '2026-10-25',
      daysToDue: 6,
      overdue: false,
      owedMinor: 920_000,
      availableMinor: 10_000_000 - 920_000,
    });
    expect(cardsDueSoon(accounts, data, TODAY).map((c) => c.card.id)).toEqual(['card']);
    expect(cardsDueSoon(accounts, data, TODAY, 3)).toEqual([]);
    const late = cardStatus(card, accounts, data, '2026-10-27');
    expect(late).toMatchObject({ overdue: true, daysToDue: -2 });
  });

  it('a due day before the statement day falls next month', () => {
    expect(nextDateOnDay('2026-10-20', 10)).toBe('2026-11-10');
    expect(nextDateOnDay('2026-01-31', 28)).toBe('2026-02-28');
    expect(lastDateOnDay('2026-10-19', 20)).toBe('2026-09-20');
    expect(lastDateOnDay('2026-03-01', 28)).toBe('2026-02-28');
  });

  it('cash flow counts spending and fees out, money in in, and ignores transfers', () => {
    const flows = [
      flow('income', '2026-10-01', 4_000_000),
      flow('income', '2026-09-30', 1_000), // another month
      flow('fee', '2026-10-08', 45_000),
      flow('transfer', '2026-10-07', 100_000),
      flow('income', '2026-10-30', 9_999), // after the day on screen
    ];
    const tx = [spend('2026-10-02', 50_000, 'UPI'), spend('2026-10-03', 2_000, 'Cash')];
    expect(cashFlow(tx, flows, '2026-10', TODAY)).toEqual({
      month: '2026-10',
      inMinor: 4_000_000,
      spentMinor: 52_000,
      feesMinor: 45_000,
      outMinor: 97_000,
      leftMinor: 4_000_000 - 97_000,
    });
  });

  it('a cash check reports the difference either way', () => {
    expect(cashCheck(91_000, 84_000)).toEqual({ differenceMinor: -7_000 });
    expect(cashCheck(91_000, 95_000)).toEqual({ differenceMinor: 4_000 });
  });
});

describe('money in from quick add', () => {
  const parse = (t: string) => parseQuickEntry(t, { today: TODAY, lastMethod: 'UPI' });
  it.each([
    [
      'salary 40k',
      { kind: 'income', incomeKind: 'salary', amountMinor: 4_000_000, merchant: 'Salary' },
    ],
    [
      'got 500 from Rahul',
      { kind: 'income', incomeKind: 'other', amountMinor: 50_000, merchant: 'From Rahul' },
    ],
    [
      'refund 299 credited yesterday',
      { kind: 'income', incomeKind: 'refund', merchant: 'Refund', date: '2026-10-18' },
    ],
    [
      'received 2000 freelance client',
      { kind: 'income', incomeKind: 'business', merchant: 'Freelance Client' },
    ],
    ['cashback 50 paytm', { kind: 'income', incomeKind: 'refund', method: 'UPI' }],
    ['chai 20', { kind: 'expense' }],
    ['shawarma 500 on 18th oct upi', { kind: 'expense' }],
  ])('%s', (text, expected) => {
    expect(parse(text)).toMatchObject(expected);
  });

  it('knows kinds of income', () => {
    expect(incomeKindFor('FD interest')).toBe('interest');
    expect(incomeKindFor('shagun from mama')).toBe('gift');
    expect(incomeKindFor('rent from tenant')).toBe('other');
  });
});

describe('udhaar', () => {
  const e = (
    kind: UdhaarEntry['kind'],
    amountMinor: number,
    personId = 'r',
    date = '2026-10-10',
  ): UdhaarEntry => ({
    id: `${kind}${amountMinor}${personId}`,
    personId,
    kind,
    date,
    amountMinor,
    note: '',
    createdAt: 0,
    updatedAt: 0,
  });
  const people = [
    { id: 'r', name: 'Rahul', createdAt: 0 },
    { id: 'p', name: 'Priya', createdAt: 0 },
    { id: 's', name: 'Sam', createdAt: 0 },
  ];
  const entries = [
    e('lent', 100_000),
    e('got-back', 40_000, 'r', '2026-10-15'),
    e('borrowed', 20_000, 'p'),
    e('lent', 5_000, 's'),
    e('got-back', 5_000, 's'),
  ];

  it('keeps a running balance per person', () => {
    expect(owedEffect(e('paid-back', 1))).toBe(1);
    expect(personBalance(entries, 'r')).toBe(60_000);
    expect(personBalance(entries, 'p')).toBe(-20_000);
    const summary = udhaarSummary(people, entries);
    expect(summary.map((s) => [s.person.name, s.balanceMinor])).toEqual([
      ['Rahul', 60_000],
      ['Priya', -20_000],
      ['Sam', 0],
    ]);
    expect(summary[0]!.lastDate).toBe('2026-10-15');
    expect(udhaarTotals(summary)).toEqual({ owedToYouMinor: 60_000, youOweMinor: 20_000 });
    expect(settleKind(60_000)).toBe('got-back');
    expect(settleKind(-1)).toBe('paid-back');
    expect(settleKind(0)).toBeNull();
  });

  it('writes a polite reminder with the real amount, even in privacy mode', () => {
    setPrivacy(true);
    try {
      expect(reminderText('Rahul', 60_000, '2026-10-10')).toBe(
        'Hi Rahul, a gentle reminder about the ₹600.00 from 10 Oct 2026. No rush, whenever it suits you. Thanks.',
      );
    } finally {
      setPrivacy(false);
    }
  });
});

describe('loans and EMIs', () => {
  const loan: Loan = {
    id: 'l',
    name: 'Bike loan',
    lender: 'Bank',
    principalMinor: 10_000_000, // ₹1,00,000
    rateBp: 1200, // 12% a year, 1% a month
    months: 12,
    firstDate: '2026-01-05',
    createdAt: 0,
    updatedAt: 0,
  };

  it('works out the standard EMI', () => {
    expect(emiFor(10_000_000, 1200, 12)).toBe(888_488); // ₹8,884.88
    expect(emiFor(1_200_000, 0, 12)).toBe(100_000);
    expect(parseRateBp('10.5')).toBe(1050);
    expect(parseRateBp('8.75%')).toBe(875);
    expect(parseRateBp('abc')).toBeNull();
    expect(parseRateBp('150')).toBeNull();
    expect(rateText(1050)).toBe('10.5');
    expect(rateText(875)).toBe('8.75');
    expect(rateText(1200)).toBe('12');
  });

  it('builds a schedule that ends at zero, with interest falling as the balance does', () => {
    const rows = schedule(loan);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({
      date: '2026-01-05',
      interestMinor: 100_000,
      principalMinor: 788_488,
    });
    expect(rows[11]!.balanceMinor).toBe(0);
    expect(rows[11]!.date).toBe('2026-12-05');
    expect(rows.reduce((s, r) => s + r.principalMinor, 0)).toBe(10_000_000);
    expect(rows[5]!.interestMinor).toBeLessThan(rows[4]!.interestMinor);
  });

  it('says where the loan stands today', () => {
    const s = loanStatus(loan, TODAY);
    expect(s).toMatchObject({
      paidCount: 10,
      totalCount: 12,
      nextDate: '2026-11-05',
      endDate: '2026-12-05',
      repays: true,
    });
    expect(s.remainingMinor).toBe(schedule(loan)[9]!.balanceMinor);
    expect(s.interestLeftMinor).toBe(
      schedule(loan)[10]!.interestMinor + schedule(loan)[11]!.interestMinor,
    );
  });

  it('paying more each month ends sooner and saves interest', () => {
    const effect = prepayEffect(loan, 500_000);
    expect(effect.monthsSaved).toBeGreaterThan(3);
    expect(effect.interestSavedMinor).toBeGreaterThan(0);
    expect(prepayEffect(loan, 0)).toMatchObject({ monthsSaved: 0, interestSavedMinor: 0 });
  });

  it('an EMI that does not cover the interest never repays', () => {
    const s = loanStatus({ ...loan, emiMinor: 50_000 }, TODAY);
    expect(s.repays).toBe(false);
  });
});

describe('foreign currency', () => {
  it('reads rates and converts to rupees to the paisa', () => {
    expect(parseRate('83.25')).toBe(832_500);
    expect(parseRate('0.0123')).toBe(123);
    expect(parseRate('83.12345')).toBeNull();
    expect(parseRate('-1')).toBeNull();
    expect(parseRate('0')).toBeNull();
    expect(convertMinor(5_000, 832_500)).toBe(416_250); // $50 at 83.25 = ₹4,162.50
    expect(convertMinor(1, 832_500)).toBe(83);
    expect(rateAsMinor(832_500)).toBe(8_325);
    expect(rateInput(832_500)).toBe('83.25');
    expect(rateInput(830_000)).toBe('83');
  });
});
