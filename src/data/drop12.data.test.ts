import { describe, expect, it } from 'vitest';
import { parseQuickEntry } from '../domain/parser';
import type { CustomRule } from '../domain/rules';
import type { SavedReport } from '../domain/reports';
import { exportBackup, validateBackup } from './backup';
import { openLedgerDB } from './db';
import { createLedgerStore, type EntryDraft, type ProjectDraft } from './store';

const fresh = async () => {
  const s = createLedgerStore(`drop12-${Math.random().toString(36).slice(2)}`);
  await s.getState().init();
  return s;
};
type Store = Awaited<ReturnType<typeof fresh>>;

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  date: '2026-10-18',
  amountMinor: 90_000,
  merchant: 'Dinner',
  categoryId: 'food',
  method: 'UPI',
  notes: '',
  tags: [],
  ...over,
});

const goa: ProjectDraft = {
  name: 'Goa',
  kind: 'trip',
  start: '2026-10-15',
  end: '2026-10-25',
  budgetMinor: 2_000_000,
  collect: true,
};

const rule = (over: Partial<CustomRule> = {}): CustomRule => ({
  id: `r-${Math.random().toString(36).slice(2)}`,
  match: 'contains',
  text: 'amazon',
  set: { categoryId: 'shopping', tag: 'online', forWhom: 'Shop', taxSection: '80C' },
  createdAt: 1,
  ...over,
});

const quick = (s: Store, text: string, today = '2026-10-18') =>
  s.getState().addFromParsed(
    parseQuickEntry(text, {
      today,
      rules: s.getState().rules,
      customRules: s.getState().customRules,
      categories: s.getState().categories,
    }),
  );

const last = (s: Store) =>
  s
    .getState()
    .transactions.find(
      (t) => t.createdAt === Math.max(...s.getState().transactions.map((x) => x.createdAt)),
    )!;

describe('Drop 12 data', () => {
  it('upgrades a version 3 database to version 4 with a projects store, keeping everything', async () => {
    const name = `drop12-upgrade-${Math.random().toString(36).slice(2)}`;
    const { openDB } = await import('idb');
    const { MIGRATIONS } = await import('./migrations');
    const v3 = await openDB(name, 3, {
      upgrade(db, oldVersion, _n, tx) {
        for (let v = oldVersion; v < 3; v += 1) MIGRATIONS[v]!(db as never, tx as never);
      },
    });
    await v3.put('goals', { id: 'g', name: 'Laptop' });
    v3.close();
    const db = await openLedgerDB(name);
    expect(db.version).toBe(4);
    expect(await db.get('goals', 'g')).toBeTruthy();
    expect([...db.objectStoreNames]).toContain('projects');
    db.close();
  });

  it('keeps trips: entries in their dates join, others do not, and deleting one keeps its entries', async () => {
    const s = await fresh();
    const id = await s.getState().saveProject(goa);
    await s.getState().addEntry(draft({ date: '2026-10-18' }));
    expect(last(s).projectId).toBe(id);
    await s
      .getState()
      .addEntry(draft({ date: '2026-10-18', merchant: 'Not on the trip', projectId: null }));
    expect(last(s).projectId).toBeUndefined();
    await s.getState().addEntry(draft({ date: '2026-10-30', merchant: 'After' }));
    expect(last(s).projectId).toBeUndefined();
    await quick(s, 'fish thali 400 yesterday', '2026-10-20');
    expect(last(s).projectId).toBe(id);
    await s
      .getState()
      .addMany([
        parseQuickEntry('cab 900', { today: '2026-10-21' }),
        parseQuickEntry('chai 20', { today: '2026-10-27' }),
      ]);
    const cab = s.getState().transactions.find((t) => t.merchant === 'Cab')!;
    const chai = s.getState().transactions.find((t) => t.merchant === 'Chai')!;
    expect(cab.projectId).toBe(id);
    expect(chai.projectId).toBeUndefined();

    // Bulk: add one in, take one out; one undo each.
    await s.getState().setEntriesProject([chai.id], id);
    expect(s.getState().transactions.find((t) => t.id === chai.id)!.projectId).toBe(id);
    expect(s.getState().undoLabel).toBe('Added 1 entry to Goa');
    await s.getState().undo();
    expect(s.getState().transactions.find((t) => t.id === chai.id)!.projectId).toBeUndefined();

    // Editing other fields keeps the trip; null takes it out.
    await s
      .getState()
      .editTransaction(cab.id, draft({ date: cab.date, merchant: 'Cab', amountMinor: 95_000 }));
    expect(s.getState().transactions.find((t) => t.id === cab.id)!.projectId).toBe(id);
    await s
      .getState()
      .editTransaction(cab.id, draft({ date: cab.date, merchant: 'Cab', projectId: null }));
    expect(s.getState().transactions.find((t) => t.id === cab.id)!.projectId).toBeUndefined();

    const before = s.getState().transactions.filter((t) => t.projectId === id).length;
    expect(before).toBeGreaterThan(0);
    await s.getState().deleteProject(id);
    expect(s.getState().projects).toEqual([]);
    expect(s.getState().transactions.some((t) => t.projectId === id)).toBe(false);
    expect(s.getState().transactions).toHaveLength(6);
    await s.getState().undo();
    expect(s.getState().projects).toHaveLength(1);
    expect(s.getState().transactions.filter((t) => t.projectId === id)).toHaveLength(before);
  });

  it('applies your rules: quick add takes all of it, the form only adds to it, saving can change past entries', async () => {
    const s = await fresh();
    await s.getState().addEntry(draft({ merchant: 'Amazon', categoryId: 'other' }));
    await s.getState().addEntry(draft({ merchant: 'Amazon Fresh', categoryId: 'groceries' }));
    await s.getState().addEntry(draft({ merchant: 'Flipkart', categoryId: 'shopping' }));
    const r = rule();
    const ids = s
      .getState()
      .transactions.filter((t) => t.merchant.startsWith('Amazon'))
      .map((t) => t.id);
    await s.getState().saveCustomRule(r, ids);
    expect(s.getState().customRules).toEqual([r]);
    expect(s.getState().undoLabel).toBe('Added a rule for amazon, changed 2 entries');
    const amazon = () => s.getState().transactions.filter((t) => t.merchant.startsWith('Amazon'));
    expect(amazon().every((t) => t.categoryId === 'shopping' && t.forWhom === 'Shop')).toBe(true);
    expect(amazon().every((t) => t.tags.includes('online') && t.taxSection === '80C')).toBe(true);
    await s.getState().undo();
    expect(s.getState().customRules).toEqual([]);
    expect(
      amazon()
        .map((t) => t.categoryId)
        .sort(),
    ).toEqual(['groceries', 'other']);
    await s.getState().redo();

    await quick(s, 'amazon 1200');
    expect(last(s)).toMatchObject({
      categoryId: 'shopping',
      tags: ['online'],
      forWhom: 'Shop',
      taxSection: '80C',
      unsure: false,
    });

    // The form's category stays; what was left empty is filled in.
    await s
      .getState()
      .addEntry(draft({ merchant: 'Amazon gift', categoryId: 'other', forWhom: 'Amma' }));
    expect(last(s)).toMatchObject({
      categoryId: 'other',
      forWhom: 'Amma',
      taxSection: '80C',
      tags: ['online'],
    });

    const second = rule({ text: 'flipkart', set: { tag: 'online' } });
    await s.getState().saveCustomRule(second);
    await s.getState().moveCustomRule(second.id, -1);
    expect(s.getState().customRules.map((x) => x.id)).toEqual([second.id, r.id]);
    await s.getState().deleteCustomRule(r.id);
    expect(s.getState().customRules.map((x) => x.id)).toEqual([second.id]);
  });

  it('keeps subcategories with their category', async () => {
    const s = await fresh();
    const coffee = (await s.getState().saveSubcategory('food', 'Coffee'))!;
    expect(coffee).toBe('food/coffee');
    await s.getState().saveSubcategory('food', 'Coffee and tea', coffee);
    expect(s.getState().categories.find((c) => c.id === 'food')!.subcategories).toEqual([
      { id: 'food/coffee', name: 'Coffee and tea' },
    ]);
    await s.getState().saveSubcategory('food', 'Coffee');
    const sub = s.getState().categories.find((c) => c.id === 'food')!.subcategories![1]!.id;

    await quick(s, 'coffee 120');
    expect(last(s)).toMatchObject({ categoryId: 'food', subcategoryId: sub });
    const id = last(s).id;
    // A subcategory that does not belong to the category is dropped.
    await s.getState().addEntry(draft({ categoryId: 'groceries', subcategoryId: sub }));
    expect(last(s).subcategoryId).toBeUndefined();
    // Moving to another category clears it.
    await s.getState().bulkSetCategory([id], 'groceries');
    expect(s.getState().transactions.find((t) => t.id === id)!.subcategoryId).toBeUndefined();
    await s.getState().undo();
    expect(s.getState().transactions.find((t) => t.id === id)!.subcategoryId).toBe(sub);

    await s.getState().deleteSubcategory('food', sub);
    expect(s.getState().transactions.find((t) => t.id === id)!.subcategoryId).toBeUndefined();
    expect(s.getState().categories.find((c) => c.id === 'food')!.subcategories).toHaveLength(1);
    await s.getState().undo();
    expect(s.getState().transactions.find((t) => t.id === id)!.subcategoryId).toBe(sub);

    await s.getState().setCategoryNeed('food', 'need');
    expect(s.getState().categories.find((c) => c.id === 'food')!.need).toBe('need');
  });

  it('remembers saved reports and nudges put away', async () => {
    const s = await fresh();
    const report: SavedReport = {
      id: 'r1',
      name: 'Last quarter of food',
      range: { kind: 'relative', id: 'last-3-months' },
      compare: 'lastYear',
      createdAt: 1,
    };
    await s.getState().saveReport(report);
    expect(s.getState().savedReports).toEqual([report]);
    await s.getState().dismissNudge('dup:a:b');
    await s.getState().dismissNudge('dup:a:b');
    expect(s.getState().nudgesDismissed).toEqual(['dup:a:b']);
    await s.getState().deleteReport('r1');
    expect(s.getState().savedReports).toEqual([]);
  });

  it('backs up trips, rules and saved reports, and merges them back', async () => {
    const s = await fresh();
    await s.getState().saveProject(goa);
    const r = rule();
    await s.getState().saveCustomRule(r);
    await s.getState().saveReport({
      id: 'rep',
      name: 'Year so far',
      range: { kind: 'fy', offset: 0 },
      compare: 'previous',
      createdAt: 1,
    });
    await s.getState().addEntry(draft({ warrantyMonths: 12, forWhom: 'Amma', taxSection: '80D' }));
    const file = await exportBackup(s.getState().getDb());
    expect(file.data.projects).toHaveLength(1);
    expect(file.data.customRules).toEqual([r]);
    expect(file.data.savedReports).toHaveLength(1);
    expect(file.data.transactions[0]).toMatchObject({
      warrantyMonths: 12,
      forWhom: 'Amma',
      taxSection: '80D',
    });
    const json = JSON.parse(JSON.stringify(file));
    expect(validateBackup(json)).not.toBeNull();
    expect(
      validateBackup({ ...json, data: { ...json.data, customRules: [{ id: 1 }] } }),
    ).toBeNull();

    const other = await fresh();
    await other.getState().importFromBackup(validateBackup(json)!);
    expect(other.getState().projects.map((p) => p.name)).toEqual(['Goa']);
    expect(other.getState().customRules).toEqual([r]);
    expect(other.getState().savedReports.map((x) => x.name)).toEqual(['Year so far']);
    // Merging again adds nothing new.
    await other.getState().importFromBackup(validateBackup(json)!);
    expect(other.getState().customRules).toHaveLength(1);

    const third = await fresh();
    await third.getState().saveProject({ ...goa, name: 'Kerala' });
    await third.getState().restoreBackup(validateBackup(json)!);
    expect(third.getState().projects.map((p) => p.name)).toEqual(['Goa']);
    await third.getState().undo();
    expect(third.getState().projects.map((p) => p.name)).toEqual(['Kerala']);
  });
});
