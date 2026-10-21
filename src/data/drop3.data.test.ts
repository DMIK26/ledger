import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup, validateBackup } from './backup';
import { createLedgerStore } from './store';

const fresh = async () => {
  const s = createLedgerStore(`drop3-${Math.random().toString(36).slice(2)}`);
  await s.getState().init();
  return s;
};

describe('budgets in the store', () => {
  it('replaces a month in one undoable step and drops zero amounts', async () => {
    const s = await fresh();
    await s
      .getState()
      .setMonthBudgets('2026-10', { overall: 1_000_000, categories: { food: 300_000 } });
    await s.getState().setMonthBudgets('2026-10', {
      overall: 1_000_000,
      categories: { food: 0, transport: 100_000 },
    });
    expect(
      s
        .getState()
        .budgets.map((b) => b.id)
        .sort(),
    ).toEqual(['2026-10|overall', '2026-10|transport']);
    await s.getState().undo();
    expect(
      s
        .getState()
        .budgets.map((b) => b.id)
        .sort(),
    ).toEqual(['2026-10|food', '2026-10|overall']);
    // Saving the same budgets again is not a new undo step.
    const label = s.getState().undoLabel;
    await s
      .getState()
      .setMonthBudgets('2026-10', { overall: 1_000_000, categories: { food: 300_000 } });
    expect(s.getState().undoLabel).toBe(label);
  });
});

describe('budgets in backups', () => {
  it('round-trips budgets, and accepts older backups without them', async () => {
    const a = await fresh();
    await a
      .getState()
      .setMonthBudgets('2026-10', { overall: 500_000, categories: { food: 100_000 } });
    const file = await exportBackup(a.getState().getDb());
    expect(file.data.budgets).toHaveLength(2);

    const b = await fresh();
    await importBackup(
      b.getState().getDb(),
      validateBackup(JSON.parse(JSON.stringify(file)))!,
      'replace',
    );
    expect(await b.getState().getDb().count('budgets')).toBe(2);

    const c = await fresh();
    expect(
      await c.getState().importFromBackup(validateBackup(JSON.parse(JSON.stringify(file)))!),
    ).toBe(0);
    expect(c.getState().budgets).toHaveLength(2);

    const old = JSON.parse(JSON.stringify(file));
    delete old.data.budgets;
    expect(validateBackup(old)).not.toBeNull();
    const bad = JSON.parse(JSON.stringify(file));
    bad.data.budgets = [{ id: 'x', amountMinor: 1.5 }];
    expect(validateBackup(bad)).toBeNull();
  });
});
