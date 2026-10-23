import { describe, expect, it } from 'vitest';
import { todayISO } from '../domain/dates';
import { savedMinor } from '../domain/goals';
import { exportBackup, validateBackup } from './backup';
import { DB_VERSION, openLedgerDB } from './db';
import { createLedgerStore } from './store';

const fresh = async () => {
  const s = createLedgerStore(`drop10-${Math.random().toString(36).slice(2)}`);
  await s.getState().init();
  return s;
};

const today = todayISO();

describe('Drop 10 data', () => {
  it('upgrades a version 2 database without touching accounts or entries', async () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(3);
    const name = `drop10-upgrade-${Math.random().toString(36).slice(2)}`;
    const { openDB } = await import('idb');
    const { MIGRATIONS } = await import('./migrations');
    const v2 = await openDB(name, 2, {
      upgrade(db, oldVersion, _n, tx) {
        for (let v = oldVersion; v < 2; v += 1) MIGRATIONS[v]!(db as never, tx as never);
      },
    });
    await v2.put('accounts', {
      id: 'bank',
      name: 'Bank',
      kind: 'bank',
      openingMinor: 100,
      openingDate: '2026-01-01',
      methods: [],
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    v2.close();
    const db = await openLedgerDB(name);
    expect(await db.get('accounts', 'bank')).toBeTruthy();
    expect([...db.objectStoreNames]).toEqual(
      expect.arrayContaining(['goals', 'wishlist', 'assets']),
    );
    db.close();
  });

  it('sets a category’s budget type and rollover, and resets a month’s plan, all undoable', async () => {
    const s = await fresh();
    await s.getState().setCategoryPlan('food', { budgetKind: 'fixed' });
    await s.getState().setCategoryPlan('food', { rollover: true });
    const food = () => s.getState().categories.find((c) => c.id === 'food')!;
    expect(food()).toMatchObject({ budgetKind: 'fixed', rollover: true });
    expect(s.getState().undoLabel).toBe('Turned on rollover for Food & Dining');
    await s.getState().undo();
    expect(food().rollover).toBeUndefined();

    const month = today.slice(0, 7);
    await s
      .getState()
      .setMonthBudgets(month, { overall: 1_000_000, categories: { food: 300_000 } });
    await s.getState().clearMonthBudgets(month);
    expect(s.getState().budgets).toHaveLength(0);
    await s.getState().undo();
    expect(s.getState().budgets).toHaveLength(2);
  });

  it('goals take amounts, snooze, get paid and start again', async () => {
    const s = await fresh();
    const id = await s.getState().saveGoal({
      name: ' Diwali ',
      kind: 'fund',
      targetMinor: 500_000,
      startDate: today,
      dueDate: '2099-11-08',
      yearly: true,
    });
    const goal = () => s.getState().goals.find((g) => g.id === id)!;
    expect(goal()).toMatchObject({ name: 'Diwali', contributions: [], snoozed: [], yearly: true });
    await s.getState().addToGoal(id, 300_000, today);
    await s.getState().addToGoal(id, 250_000, today);
    expect(savedMinor(goal())).toBe(550_000);
    await s.getState().removeFromGoal(id, goal().contributions[1]!.id);
    expect(savedMinor(goal())).toBe(300_000);
    await s.getState().undo();
    expect(savedMinor(goal())).toBe(550_000);
    await s.getState().snoozeGoal(id, '2099-10', true);
    expect(goal().snoozed).toEqual(['2099-10']);
    await s.getState().payGoal(id);
    expect(goal()).toMatchObject({ dueDate: '2100-11-08', lastPaidOn: today, snoozed: [] });
    expect(savedMinor(goal())).toBe(50_000); // what was beyond the target stays
    await s.getState().undo();
    expect(goal().dueDate).toBe('2099-11-08');
    await s.getState().deleteGoal(id);
    expect(s.getState().goals).toHaveLength(0);
    // Goals never touch spending or accounts.
    expect(s.getState().transactions).toHaveLength(0);
    expect(s.getState().flows).toHaveLength(0);
  });

  it('buying a wish logs the expense in the same step; skipping counts as saved', async () => {
    const s = await fresh();
    await s.getState().setSetting('lastMethod', 'Card');
    await s.getState().saveWish({ name: 'Headphones', priceMinor: 300_000, waitDays: 7, note: '' });
    await s
      .getState()
      .saveWish({ name: 'Swiggy treat', priceMinor: 50_000, waitDays: 7, note: 'friday' });
    const byName = (n: string) => s.getState().wishlist.find((w) => w.name === n);
    const treat = byName('Swiggy treat');
    const phones = byName('Headphones');
    expect(phones).toMatchObject({ status: 'waiting', addedOn: today });
    await s.getState().buyWish(treat!.id);
    expect(s.getState().transactions[0]).toMatchObject({
      merchant: 'Swiggy treat',
      amountMinor: 50_000,
      categoryId: 'food',
      method: 'Card',
      date: today,
      notes: 'friday',
      source: 'wishlist',
    });
    expect(s.getState().wishlist.find((w) => w.id === treat!.id)).toMatchObject({
      status: 'bought',
      txId: s.getState().transactions[0]!.id,
    });
    await s.getState().undo();
    expect(s.getState().transactions).toHaveLength(0);
    expect(s.getState().wishlist.every((w) => w.status === 'waiting')).toBe(true);
    await s.getState().skipWish(phones!.id);
    expect(s.getState().wishlist.find((w) => w.id === phones!.id)).toMatchObject({
      status: 'skipped',
      decidedOn: today,
    });
    await s.getState().deleteWish(phones!.id);
    expect(s.getState().wishlist).toHaveLength(1);
  });

  it('assets keep dated values; the same date replaces', async () => {
    const s = await fresh();
    await s
      .getState()
      .saveAsset({ name: 'Gold', kind: 'gold', valueMinor: 5_000_000, date: '2026-03-01' });
    const id = s.getState().assets[0]!.id;
    await s.getState().setAssetValue(id, 5_500_000, '2026-09-30');
    await s.getState().setAssetValue(id, 5_600_000, '2026-09-30');
    expect(s.getState().assets[0]!.values).toEqual([
      { date: '2026-03-01', valueMinor: 5_000_000 },
      { date: '2026-09-30', valueMinor: 5_600_000 },
    ]);
    await s
      .getState()
      .saveAsset({ name: 'Gold coins', kind: 'gold', valueMinor: 0, date: today }, id);
    expect(s.getState().assets[0]).toMatchObject({ name: 'Gold coins' });
    expect(s.getState().assets[0]!.values).toHaveLength(2);
    await s.getState().deleteAsset(id);
    expect(s.getState().assets).toHaveLength(0);
  });

  it('closes a month once, undoably', async () => {
    const s = await fresh();
    await s.getState().closeMonth('2026-09');
    await s.getState().closeMonth('2026-09');
    expect(s.getState().closedMonths).toEqual(['2026-09']);
    expect(s.getState().undoLabel).toBe('Closed September 2026');
    await s.getState().undo();
    expect(s.getState().closedMonths).toEqual([]);
    await s.getState().closeMonth('2026-09', '  Spent less on food. ');
    expect(s.getState().notes[0]).toMatchObject({
      anchor: 'month:2026-09',
      text: 'Spent less on food.',
    });
    await s.getState().undo();
    expect(s.getState().notes).toHaveLength(0);
    expect(s.getState().closedMonths).toEqual([]);
  });

  it('backs up goals, the wishlist, assets and closed months, and restores them', async () => {
    const s = await fresh();
    const id = await s.getState().saveGoal({
      name: 'Phone',
      kind: 'goal',
      targetMinor: 1_200_000,
      startDate: today,
      dueDate: '2099-01-01',
    });
    await s.getState().addToGoal(id, 100_000, today);
    await s.getState().saveWish({ name: 'Shoes', priceMinor: 200_000, waitDays: 30, note: '' });
    await s.getState().saveAsset({ name: 'PF', kind: 'pf', valueMinor: 900_000, date: today });
    await s.getState().closeMonth('2026-09');
    const file = validateBackup(
      JSON.parse(JSON.stringify(await exportBackup(s.getState().getDb()))),
    );
    expect(file?.data.goals?.[0]?.contributions).toHaveLength(1);
    expect(file?.data.wishlist).toHaveLength(1);
    expect(file?.data.assets).toHaveLength(1);
    expect(file?.data.closedMonths).toEqual(['2026-09']);
    const bad = JSON.parse(JSON.stringify(file));
    bad.data.goals[0].contributions[0].amountMinor = 1.5;
    expect(validateBackup(bad)).toBeNull();
    bad.data.goals[0].contributions[0].amountMinor = 100;
    bad.data.closedMonths = ['September'];
    expect(validateBackup(bad)).toBeNull();

    const other = await fresh();
    await other.getState().importFromBackup(file!);
    expect(other.getState().goals).toHaveLength(1);
    expect(other.getState().wishlist).toHaveLength(1);
    expect(other.getState().assets).toHaveLength(1);
    expect(other.getState().closedMonths).toEqual(['2026-09']);
    await other.getState().importFromBackup(file!);
    expect(other.getState().goals).toHaveLength(1);

    const third = await fresh();
    await third.getState().saveWish({ name: 'Mine', priceMinor: 1, waitDays: 7, note: '' });
    await third.getState().restoreBackup(file!);
    expect(third.getState().wishlist.map((w) => w.name)).toEqual(['Shoes']);
    await third.getState().undo();
    expect(third.getState().wishlist.map((w) => w.name)).toEqual(['Mine']);
  });
});
