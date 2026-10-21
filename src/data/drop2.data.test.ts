import { describe, expect, it, vi } from 'vitest';
import { purgeTrash } from './bus';
import { createLedgerStore, type EntryDraft } from './store';
import { EMPTY_FILTERS, DEFAULT_SORT } from '../domain/filters';

let counter = 0;
const fresh = async () => {
  const store = createLedgerStore(`drop2-${(counter += 1)}-${Math.random().toString(36).slice(2)}`);
  await store.getState().init();
  return store;
};

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  date: '2026-10-18',
  amountMinor: 50000,
  merchant: 'Shawarma',
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
  ...over,
});

const receipt = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

describe('entries from the form', () => {
  it('adds with a receipt, and one undo removes both', async () => {
    const s = await fresh();
    await s.getState().addEntry(draft({ tags: ['work'] }), receipt());
    const [t] = s.getState().transactions;
    expect(t).toMatchObject({
      merchant: 'Shawarma',
      source: 'form',
      hasReceipt: true,
      tags: ['work'],
    });
    expect(await s.getState().getReceipt(t!.id)).toBeDefined();
    await s.getState().undo();
    expect(s.getState().transactions).toHaveLength(0);
    expect(await s.getState().getReceipt(t!.id)).toBeUndefined();
  });

  it('learns a rule when an unknown merchant gets a category', async () => {
    const s = await fresh();
    await s.getState().addEntry(draft({ merchant: 'Zorblax', categoryId: 'education' }));
    expect(s.getState().rules).toEqual({ zorblax: 'education' });
  });

  it('edits in place, clears unsure and remembers the merchant; undo restores everything', async () => {
    const s = await fresh();
    const { parseQuickEntry } = await import('../domain/parser');
    await s.getState().addFromParsed(parseQuickEntry('qwerty 90', { today: '2026-10-19' }));
    const before = s.getState().transactions[0]!;
    expect(before.unsure).toBe(true);
    await s.getState().editTransaction(before.id, {
      ...draft({
        merchant: before.merchant,
        amountMinor: 9500,
        categoryId: 'shopping',
        date: before.date,
      }),
    });
    const after = s.getState().transactions[0]!;
    expect(after).toMatchObject({
      amountMinor: 9500,
      categoryId: 'shopping',
      unsure: false,
      id: before.id,
    });
    expect(s.getState().rules).toEqual({ qwerty: 'shopping' });
    await s.getState().undo();
    expect(s.getState().transactions[0]).toEqual(before);
    expect(s.getState().rules).toEqual({});
  });

  it('replaces and removes receipts through edit', async () => {
    const s = await fresh();
    await s.getState().addEntry(draft());
    const id = s.getState().transactions[0]!.id;
    await s.getState().editTransaction(id, draft(), receipt());
    expect(s.getState().transactions[0]?.hasReceipt).toBe(true);
    await s.getState().editTransaction(id, draft(), null);
    expect(s.getState().transactions[0]?.hasReceipt).toBeUndefined();
    expect(await s.getState().getReceipt(id)).toBeUndefined();
    await s.getState().undo();
    expect(await s.getState().getReceipt(id)).toBeDefined();
  });
});

describe('bulk actions', () => {
  it('moves, tags and deletes several entries as single undo steps', async () => {
    const s = await fresh();
    for (const m of ['A', 'B', 'C']) await s.getState().addEntry(draft({ merchant: m }));
    const ids = s
      .getState()
      .transactions.slice(0, 2)
      .map((t) => t.id);
    await s.getState().bulkSetCategory(ids, 'business');
    expect(s.getState().transactions.filter((t) => t.categoryId === 'business')).toHaveLength(2);
    await s.getState().bulkAddTag(ids, 'trip');
    expect(s.getState().transactions.filter((t) => t.tags.includes('trip'))).toHaveLength(2);
    await s.getState().bulkDelete(ids);
    expect(s.getState().transactions).toHaveLength(1);
    expect(s.getState().trash).toHaveLength(2);
    await s.getState().undo();
    expect(s.getState().transactions).toHaveLength(3);
    await s.getState().undo();
    expect(s.getState().transactions.filter((t) => t.tags.includes('trip'))).toHaveLength(0);
  });
});

describe('trash', () => {
  it('restores, deletes for good (undoable), and purges receipts with old trash', async () => {
    const s = await fresh();
    await s.getState().addEntry(draft(), receipt());
    const id = s.getState().transactions[0]!.id;
    await s.getState().removeTransaction(id);
    expect(s.getState().trash.map((t) => t.id)).toEqual([id]);
    await s.getState().restore(id);
    expect(s.getState().transactions).toHaveLength(1);
    await s.getState().removeTransaction(id);
    await s.getState().purge(id);
    expect(s.getState().trash).toHaveLength(0);
    expect(await s.getState().getReceipt(id)).toBeUndefined();
    await s.getState().undo();
    expect(s.getState().trash).toHaveLength(1);
    expect(await s.getState().getReceipt(id)).toBeDefined();
    await purgeTrash(s.getState().getDb(), Date.now() + 31 * 86_400_000);
    expect(await s.getState().getReceipt(id)).toBeUndefined();
  });
});

describe('saved views and rules', () => {
  it('saves and deletes views, and forgets rules, all undoable', async () => {
    const s = await fresh();
    const view = {
      id: 'v1',
      name: 'Work',
      filters: { ...EMPTY_FILTERS, tags: ['work'] },
      sort: DEFAULT_SORT,
      groupBy: 'day' as const,
    };
    await s.getState().saveView(view);
    expect(s.getState().views).toEqual([view]);
    await s.getState().deleteView('v1');
    expect(s.getState().views).toEqual([]);
    await s.getState().undo();
    expect(s.getState().views).toEqual([view]);
    await s.getState().addEntry(draft({ merchant: 'Zorblax', categoryId: 'education' }));
    await s.getState().forgetRule('zorblax');
    expect(s.getState().rules).toEqual({});
  });
});

describe('screen lock', () => {
  it('locks on start when a PIN is set and unlocks only with the right PIN', async () => {
    const name = `lock-${Math.random().toString(36).slice(2)}`;
    const a = createLedgerStore(name);
    await a.getState().init();
    expect(a.getState().locked).toBe(false);
    await a.getState().setPin('2468');
    const stored = await a.getState().getDb().get('settings', 'lock');
    expect(JSON.stringify(stored)).not.toContain('2468');

    const b = createLedgerStore(name);
    await b.getState().init();
    expect(b.getState().locked).toBe(true);
    expect(await b.getState().unlock('1111')).toBe(false);
    expect(b.getState().locked).toBe(true);
    expect(await b.getState().unlock('2468')).toBe(true);
    expect(b.getState().locked).toBe(false);
    b.getState().lockNow();
    expect(b.getState().locked).toBe(true);
    expect(await b.getState().removePin('0000')).toBe(false);
    expect(await b.getState().removePin('2468')).toBe(true);
    expect(b.getState().locked).toBe(false);
  }, 20_000);
});

describe('forgotten PIN', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('removes the PIN only after 24 hours and keeps every entry', async () => {
    const name = `reset-${Math.random().toString(36).slice(2)}`;
    const t0 = Date.UTC(2026, 9, 19, 6);
    vi.useFakeTimers({ toFake: ['Date'], now: t0 });
    try {
      const a = createLedgerStore(name);
      await a.getState().init();
      await a.getState().addEntry(draft(), receipt());
      await a.getState().setPin('2468');
      a.getState().lockNow();
      await a.getState().requestPinReset();
      expect(a.getState().lockReset).toBe(t0);

      // Reopened 23 hours later: still locked, reset still pending.
      vi.setSystemTime(t0 + 23 * 60 * 60 * 1000);
      const b = createLedgerStore(name);
      await b.getState().init();
      expect(b.getState().locked).toBe(true);
      expect(b.getState().lockReset).toBe(t0);

      // Reopened after 24 hours: unlocked, PIN gone, data intact.
      vi.setSystemTime(t0 + DAY);
      const c = createLedgerStore(name);
      await c.getState().init();
      expect(c.getState().locked).toBe(false);
      expect(c.getState().lock).toBeNull();
      expect(c.getState().lockReset).toBeNull();
      expect(c.getState().transactions).toHaveLength(1);
      expect(await c.getState().getReceipt(c.getState().transactions[0]!.id)).toBeDefined();
      expect(await c.getState().getDb().get('settings', 'lock')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);

  it('the right PIN cancels a pending reset; a wrong one does not', async () => {
    const name = `cancel-${Math.random().toString(36).slice(2)}`;
    const t0 = Date.UTC(2026, 9, 19, 6);
    vi.useFakeTimers({ toFake: ['Date'], now: t0 });
    try {
      const a = createLedgerStore(name);
      await a.getState().init();
      await a.getState().setPin('2468');
      a.getState().lockNow();
      await a.getState().requestPinReset();
      expect(await a.getState().unlock('1111')).toBe(false);
      expect(a.getState().lockReset).toBe(t0);
      expect(await a.getState().unlock('2468')).toBe(true);
      expect(a.getState().lockReset).toBeNull();

      vi.setSystemTime(t0 + 2 * DAY);
      const b = createLedgerStore(name);
      await b.getState().init();
      expect(b.getState().locked).toBe(true);
      expect(b.getState().lock).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);

  it('setting a new PIN clears a pending reset', async () => {
    const s = await fresh();
    await s.getState().setPin('2468');
    await s.getState().requestPinReset();
    await s.getState().setPin('1357');
    expect(s.getState().lockReset).toBeNull();
    expect(await s.getState().getDb().get('settings', 'lockReset')).toBeUndefined();
  }, 20_000);
});
