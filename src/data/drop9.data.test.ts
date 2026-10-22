import { describe, expect, it } from 'vitest';
import { balances } from '../domain/accounts';
import { todayISO } from '../domain/dates';
import { parseQuickEntry } from '../domain/parser';
import { personBalance } from '../domain/udhaar';
import { exportBackup, validateBackup } from './backup';
import { DB_VERSION, openLedgerDB } from './db';
import { createLedgerStore } from './store';

const fresh = async () => {
  const s = createLedgerStore(`drop9-${Math.random().toString(36).slice(2)}`);
  await s.getState().init();
  return s;
};

const today = todayISO();
const money = (s: Awaited<ReturnType<typeof fresh>>) => {
  const st = s.getState();
  return balances(
    st.accounts,
    { transactions: st.transactions, flows: st.flows, udhaar: st.udhaar },
    today,
  );
};

describe('Drop 9 data', () => {
  it('upgrades a version 1 database without touching its entries', async () => {
    expect(DB_VERSION).toBe(2);
    const name = `drop9-upgrade-${Math.random().toString(36).slice(2)}`;
    const { openDB } = await import('idb');
    const { MIGRATIONS } = await import('./migrations');
    const v1 = await openDB(name, 1, {
      upgrade(db, _o, _n, tx) {
        MIGRATIONS[0]!(db as never, tx as never);
      },
    });
    await v1.put('transactions', {
      id: 'old',
      date: '2026-10-01',
      amountMinor: 100,
      currency: 'INR',
      merchant: 'Old',
      categoryId: 'food',
      method: 'Cash',
      notes: '',
      tags: [],
      source: 'quick',
      createdAt: 1,
      updatedAt: 1,
    });
    v1.close();
    const db = await openLedgerDB(name);
    expect(await db.get('transactions', 'old')).toBeTruthy();
    expect([...db.objectStoreNames].sort()).toEqual(
      expect.arrayContaining(['accounts', 'flows', 'people', 'udhaar', 'loans']),
    );
    db.close();
  });

  it('accounts, money in, transfers, fees and spending add up, and every step undoes', async () => {
    const s = await fresh();
    const bank = await s.getState().saveAccount({
      name: 'HDFC savings',
      kind: 'bank',
      openingMinor: 5_000_000,
      openingDate: '2026-01-01',
      methods: ['UPI', 'Bank transfer'],
    });
    const cash = await s.getState().saveAccount({
      name: 'Wallet cash',
      kind: 'cash',
      openingMinor: 200_000,
      openingDate: '2026-01-01',
      methods: ['Cash'],
    });
    const card = await s.getState().saveAccount({
      name: 'SBI card',
      kind: 'card',
      openingMinor: 0,
      openingDate: '2026-01-01',
      methods: ['Card', 'UPI'], // takes UPI from the bank
      statementDay: 5,
      dueDay: 25,
    });
    expect(s.getState().accounts.find((a) => a.id === bank)!.methods).toEqual(['Bank transfer']);
    await s.getState().undo(); // the card and the moved method go together
    expect(s.getState().accounts.map((a) => a.id)).toEqual([bank, cash]);
    expect(s.getState().accounts[0]!.methods).toEqual(['UPI', 'Bank transfer']);
    await s.getState().redo();
    await s
      .getState()
      .saveAccount(
        { ...s.getState().accounts.find((a) => a.id === card)!, methods: ['Card'] },
        card,
      );

    await s.getState().addIncome({
      date: today,
      amountMinor: 4_000_000,
      label: 'Salary',
      incomeKind: 'salary',
      accountId: bank,
    });
    await s.getState().addEntry({
      date: today,
      amountMinor: 300_000,
      merchant: 'Shoes',
      categoryId: 'shopping',
      method: 'Card',
      notes: '',
      tags: [],
    });
    await s.getState().addEntry({
      date: today,
      amountMinor: 2_000,
      merchant: 'Chai',
      categoryId: 'food',
      method: 'UPI',
      notes: '',
      tags: [],
      accountId: cash,
    });
    await s.getState().addTransfer({ fromId: bank, toId: card, amountMinor: 100_000, date: today });
    await s
      .getState()
      .addFee({ accountId: card, amountMinor: 4_500, date: today, label: 'Late fee' });
    expect(
      s
        .getState()
        .flows.map((f) => f.label)
        .sort(),
    ).toEqual(['Late fee', 'Paid SBI card', 'Salary']);
    expect(money(s)).toEqual({
      [bank]: 5_000_000 + 4_000_000 - 100_000,
      [cash]: 200_000 - 2_000,
      [card]: -300_000 + 100_000 - 4_500,
    });
    // Money in, transfers and fees never become spending.
    expect(
      s
        .getState()
        .transactions.map((t) => t.merchant)
        .sort(),
    ).toEqual(['Chai', 'Shoes']);
    await s.getState().undo();
    expect(s.getState().flows).toHaveLength(2);
  });

  it('quick add money in goes to the account of the method', async () => {
    const s = await fresh();
    const bank = await s.getState().saveAccount({
      name: 'Bank',
      kind: 'bank',
      openingMinor: 0,
      openingDate: '2026-01-01',
      methods: ['UPI'],
    });
    await s.getState().addIncomeFromParsed(parseQuickEntry('got 500 from Rahul upi', { today }));
    expect(s.getState().flows[0]).toMatchObject({
      kind: 'income',
      label: 'From Rahul',
      amountMinor: 50_000,
      accountId: bank,
      incomeKind: 'other',
    });
    expect(s.getState().transactions).toHaveLength(0);
  });

  it('a cash check records the gap as spending or only corrects the balance', async () => {
    const s = await fresh();
    const cash = await s.getState().saveAccount({
      name: 'Cash',
      kind: 'cash',
      openingMinor: 91_000,
      openingDate: '2026-01-01',
      methods: ['Cash'],
    });
    expect(await s.getState().resolveCashCheck(cash, 84_000, 'spending')).toBe(-7_000);
    expect(s.getState().transactions[0]).toMatchObject({
      merchant: 'Cash not logged',
      amountMinor: 7_000,
      categoryId: 'other',
      accountId: cash,
    });
    expect(money(s)[cash]).toBe(84_000);
    expect(await s.getState().resolveCashCheck(cash, 90_000, 'adjust')).toBe(6_000);
    expect(s.getState().flows[0]).toMatchObject({ kind: 'adjust', amountMinor: 6_000 });
    expect(money(s)[cash]).toBe(90_000);
    expect(await s.getState().resolveCashCheck(cash, 90_000, 'adjust')).toBe(0);
    expect(s.getState().notice).toBe('Cash matches. Nothing to change.');
  });

  it('udhaar adds people once, keeps balances, moves accounts, and deletes a person with their entries', async () => {
    const s = await fresh();
    const cash = await s.getState().saveAccount({
      name: 'Cash',
      kind: 'cash',
      openingMinor: 100_000,
      openingDate: '2026-01-01',
      methods: ['Cash'],
    });
    await s.getState().saveUdhaar({
      personName: 'Rahul',
      kind: 'lent',
      date: today,
      amountMinor: 50_000,
      note: 'Movie tickets',
      accountId: cash,
    });
    await s
      .getState()
      .saveUdhaar({
        personName: ' rahul ',
        kind: 'got-back',
        date: today,
        amountMinor: 20_000,
        note: '',
      });
    expect(s.getState().people).toHaveLength(1);
    const rahul = s.getState().people[0]!;
    expect(personBalance(s.getState().udhaar, rahul.id)).toBe(30_000);
    expect(money(s)[cash]).toBe(50_000);
    await s.getState().deletePerson(rahul.id);
    expect(s.getState().people).toHaveLength(0);
    expect(s.getState().udhaar).toHaveLength(0);
    await s.getState().undo();
    expect(s.getState().udhaar).toHaveLength(2);
  });

  it('an account in use can only be archived', async () => {
    const s = await fresh();
    const bank = await s.getState().saveAccount({
      name: 'Bank',
      kind: 'bank',
      openingMinor: 0,
      openingDate: '2026-01-01',
      methods: [],
    });
    await s
      .getState()
      .addIncome({
        date: today,
        amountMinor: 100,
        label: 'Interest',
        incomeKind: 'interest',
        accountId: bank,
      });
    expect(await s.getState().deleteAccount(bank)).toBe(false);
    await s.getState().setAccountArchived(bank, true);
    expect(s.getState().accounts[0]!.archived).toBe(true);
    const spare = await s.getState().saveAccount({
      name: 'Spare',
      kind: 'wallet',
      openingMinor: 0,
      openingDate: '2026-01-01',
      methods: [],
    });
    expect(await s.getState().deleteAccount(spare)).toBe(true);
  });

  it('loans save, update and delete', async () => {
    const s = await fresh();
    const draft = {
      name: 'Bike loan',
      lender: 'Bank',
      principalMinor: 10_000_000,
      rateBp: 1200,
      months: 12,
      firstDate: '2026-01-05',
    };
    await s.getState().saveLoan(draft);
    const id = s.getState().loans[0]!.id;
    await s.getState().saveLoan({ ...draft, rateBp: 1100 }, id);
    expect(s.getState().loans).toHaveLength(1);
    expect(s.getState().loans[0]!.rateBp).toBe(1100);
    await s.getState().deleteLoan(id);
    expect(s.getState().loans).toHaveLength(0);
  });

  it('backs everything up and restores it, merged or exactly', async () => {
    const s = await fresh();
    const bank = await s.getState().saveAccount({
      name: 'Bank',
      kind: 'bank',
      openingMinor: 0,
      openingDate: '2026-01-01',
      methods: ['UPI'],
    });
    await s
      .getState()
      .addIncome({
        date: today,
        amountMinor: 100,
        label: 'Salary',
        incomeKind: 'salary',
        accountId: bank,
      });
    await s
      .getState()
      .saveUdhaar({
        personName: 'Priya',
        kind: 'borrowed',
        date: today,
        amountMinor: 500,
        note: '',
      });
    await s.getState().saveLoan({
      name: 'Loan',
      lender: '',
      principalMinor: 100_000,
      rateBp: 0,
      months: 10,
      firstDate: today,
    });
    const file = validateBackup(
      JSON.parse(JSON.stringify(await exportBackup(s.getState().getDb()))),
    );
    expect(file?.data.accounts).toHaveLength(1);
    expect(file?.data.flows).toHaveLength(1);
    expect(file?.data.people).toHaveLength(1);
    expect(file?.data.udhaar).toHaveLength(1);
    expect(file?.data.loans).toHaveLength(1);
    expect(
      validateBackup({ ...file, data: { ...file!.data, flows: [{ id: 'x', amountMinor: 1.5 }] } }),
    ).toBeNull();

    const other = await fresh();
    await other.getState().importFromBackup(file!);
    expect(other.getState().accounts).toHaveLength(1);
    expect(other.getState().udhaar).toHaveLength(1);
    await other.getState().importFromBackup(file!);
    expect(other.getState().flows).toHaveLength(1); // merging twice adds nothing

    const third = await fresh();
    await third.getState().saveLoan({
      name: 'Mine',
      lender: '',
      principalMinor: 1,
      rateBp: 0,
      months: 1,
      firstDate: today,
    });
    await third.getState().restoreBackup(file!);
    expect(third.getState().loans.map((l) => l.name)).toEqual(['Loan']);
    await third.getState().undo();
    expect(third.getState().loans.map((l) => l.name)).toEqual(['Mine']);
  });
});
