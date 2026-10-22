import { afterEach, describe, expect, it } from 'vitest';
import { getMonthStartDay, setMonthStartDay, todayISO } from '../domain/dates';
import { parseQuickEntry } from '../domain/parser';
import { exportBackup, validateBackup } from './backup';
import { createLedgerStore, type EntryDraft } from './store';

const fresh = async () => {
  const s = createLedgerStore(`drop8-${Math.random().toString(36).slice(2)}`);
  await s.getState().init();
  return s;
};

const draft: EntryDraft = {
  date: '2026-10-18',
  amountMinor: 2000,
  merchant: 'Chai',
  categoryId: 'food',
  method: 'Cash',
  notes: '',
  tags: ['tea'],
};

afterEach(() => setMonthStartDay(1));

describe('Drop 8 data', () => {
  it('marks no-spend days once, sorted, and undoes', async () => {
    const s = await fresh();
    await s.getState().markNoSpend(['2026-10-17', '2026-10-15']);
    await s.getState().markNoSpend(['2026-10-15', '2026-10-16']);
    expect(s.getState().noSpendDays).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(s.getState().notice).toBe('Marked a day with no spending');
    await s.getState().undo();
    expect(s.getState().noSpendDays).toEqual(['2026-10-15', '2026-10-17']);
    await s.getState().markNoSpend([]);
    expect(s.getState().canRedo).toBe(true); // nothing was run
  });

  it('saves, refuses duplicate, reorders and removes favourites', async () => {
    const s = await fresh();
    const item = { ...draft, tags: ['tea'] };
    expect(await s.getState().saveFavourite(item)).toBe(true);
    expect(await s.getState().saveFavourite({ ...item, merchant: 'chai' })).toBe(false);
    expect(s.getState().notice).toBe('Chai is already a favourite');
    await s.getState().saveFavourite({ ...item, merchant: 'Metro', amountMinor: 4000 });
    expect(s.getState().favourites.map((f) => f.merchant)).toEqual(['Chai', 'Metro']);
    await s.getState().moveFavourite(s.getState().favourites[1]!.id, 0);
    expect(s.getState().favourites.map((f) => f.merchant)).toEqual(['Metro', 'Chai']);
    await s.getState().removeFavourite(s.getState().favourites[0]!.id);
    expect(s.getState().favourites.map((f) => f.merchant)).toEqual(['Chai']);
    await s.getState().undo();
    expect(s.getState().favourites).toHaveLength(2);
  });

  it('adds a repeat for today and copies entries to today in one undo', async () => {
    const s = await fresh();
    await s.getState().addRepeat({ key: 'k', ...draft });
    const added = s.getState().transactions[0]!;
    expect(added).toMatchObject({
      date: todayISO(),
      merchant: 'Chai',
      source: 'repeat',
      tags: ['tea'],
    });

    await s.getState().addEntry({ ...draft, merchant: 'Lunch', amountMinor: 15000 });
    await s.getState().addEntry({ ...draft, merchant: 'Bus', amountMinor: 3000 });
    const ids = s
      .getState()
      .transactions.filter((t) => t.merchant !== 'Chai')
      .map((t) => t.id);
    await s.getState().copyToToday(ids);
    expect(s.getState().transactions).toHaveLength(5);
    expect(s.getState().notice).toBe('Copied 2 entries to today');
    const copies = s
      .getState()
      .transactions.filter((t) => t.date === todayISO() && t.source === 'repeat');
    expect(copies.map((t) => t.merchant).sort()).toEqual(['Bus', 'Chai', 'Lunch']);
    expect(new Set(s.getState().transactions.map((t) => t.id)).size).toBe(5);
    await s.getState().undo();
    expect(s.getState().transactions).toHaveLength(3);
  });

  it('saves several parsed lines as one step and skips bad ones', async () => {
    const s = await fresh();
    const today = '2026-10-19';
    const lines = ['chai 20 cash', 'auto 40+30 upi', 'lunch', 'dosa 60 31 sep'].map((l) =>
      parseQuickEntry(l, { today, lastMethod: 'UPI' }),
    );
    expect(await s.getState().addMany(lines)).toBe(2);
    expect(
      s
        .getState()
        .transactions.map((t) => [t.merchant, t.amountMinor])
        .sort(),
    ).toEqual([
      ['Auto', 7000],
      ['Chai', 2000],
    ]);
    expect(s.getState().notice).toBe('Added 2 entries');
    await s.getState().undo();
    expect(s.getState().transactions).toHaveLength(0);
  });

  it('applies the month start day and keeps it across a restart', async () => {
    const name = `drop8-start-${Math.random().toString(36).slice(2)}`;
    const s = createLedgerStore(name);
    await s.getState().init();
    const before = s.getState().transactions;
    await s.getState().setSetting('monthStartDay', 25);
    expect(getMonthStartDay()).toBe(25);
    expect(s.getState().transactions).not.toBe(before); // pages recompute their months
    setMonthStartDay(1);
    const again = createLedgerStore(name);
    await again.getState().init();
    expect(again.getState().settings.monthStartDay).toBe(25);
    expect(getMonthStartDay()).toBe(25);
  });

  it('backs up favourites and no-spend days and merges them back', async () => {
    const s = await fresh();
    await s.getState().saveFavourite(draft);
    await s.getState().markNoSpend(['2026-10-12']);
    const file = validateBackup(
      JSON.parse(JSON.stringify(await exportBackup(s.getState().getDb()))),
    );
    expect(file?.data.favourites).toHaveLength(1);
    expect(file?.data.noSpendDays).toEqual(['2026-10-12']);

    const other = await fresh();
    await other.getState().markNoSpend(['2026-10-13']);
    await other.getState().importFromBackup(file!);
    expect(other.getState().favourites.map((f) => f.merchant)).toEqual(['Chai']);
    expect(other.getState().noSpendDays).toEqual(['2026-10-12', '2026-10-13']);

    const third = await fresh();
    await third.getState().restoreBackup(file!);
    expect(third.getState().favourites).toHaveLength(1);
    expect(third.getState().noSpendDays).toEqual(['2026-10-12']);

    expect(
      validateBackup({ ...file, data: { ...file!.data, noSpendDays: ['18 Oct'] } }),
    ).toBeNull();
  });
});
