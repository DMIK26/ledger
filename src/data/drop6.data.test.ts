import { describe, expect, it } from 'vitest';
import { exportBackup, validateBackup } from './backup';
import { createLedgerStore } from './store';
import type { Stroke } from '../domain/sketch';

const fresh = async () => {
  const s = createLedgerStore(`drop6-${Math.random().toString(36).slice(2)}`);
  await s.getState().init();
  return s;
};

const stroke = (id: string): Stroke => ({
  id,
  tool: 'pen',
  color: 'clay',
  points: [
    [0, 0, 0.5],
    [40, 10, 0.5],
  ],
});

describe('notes and sketches', () => {
  it('notes and stamps are undoable commands that survive a reload', async () => {
    const name = `drop6-${Math.random().toString(36).slice(2)}`;
    const s = createLedgerStore(name);
    await s.getState().init();
    await s.getState().saveNote({ anchor: 'category:food', page: '/', text: '  too much chai  ' });
    await s.getState().saveNote({ anchor: 'month:2026-10', page: '/', text: '', stamp: 'star' });
    expect(s.getState().notes.map((n) => [n.anchor, n.text, n.stamp])).toEqual([
      ['category:food', 'too much chai', undefined],
      ['month:2026-10', '', 'star'],
    ]);
    const id = s.getState().notes[0]!.id;
    await s.getState().saveNote({ id, anchor: 'category:food', page: '/', text: 'less chai' });
    expect(s.getState().notes[0]!.text).toBe('less chai');
    await s.getState().undo();
    expect(s.getState().notes[0]!.text).toBe('too much chai');
    await s.getState().deleteNote(id);
    expect(s.getState().notes).toHaveLength(1);
    await s.getState().undo();
    expect(s.getState().notes).toHaveLength(2);

    const again = createLedgerStore(name);
    await again.getState().init();
    expect(again.getState().notes).toHaveLength(2);
  });

  it('strokes are saved per page and month; erasing and undo restore them exactly, without toasts', async () => {
    const s = await fresh();
    await s.getState().addStroke('/', '2026-10', stroke('a'));
    await s.getState().addStroke('/', '2026-10', stroke('b'));
    await s.getState().addStroke('/', '2026-09', stroke('c'));
    expect(s.getState().notice).toBe('');
    const oct = () => s.getState().sketches.find((k) => k.id === '/|2026-10')!;
    expect(oct().strokes.map((x) => x.id)).toEqual(['a', 'b']);
    await s.getState().eraseStrokes('/', '2026-10', ['a']);
    expect(oct().strokes.map((x) => x.id)).toEqual(['b']);
    await s.getState().undo();
    expect(oct().strokes.map((x) => x.id)).toEqual(['a', 'b']);
    expect(s.getState().notice).toBe('');
    await s.getState().clearSketch('/', '2026-10');
    expect(s.getState().sketches.find((k) => k.id === '/|2026-10')).toBeUndefined();
    await s.getState().undo();
    expect(oct().strokes).toHaveLength(2);
    expect(s.getState().sketches.find((k) => k.id === '/|2026-09')!.strokes).toEqual([stroke('c')]);
  });

  it('backups carry notes and drawings, and importing adds the missing ones', async () => {
    const a = await fresh();
    await a.getState().saveNote({ anchor: 'category:food', page: '/', text: 'hello' });
    await a.getState().addStroke('/reports', '2026-10', stroke('x'));
    const file = validateBackup(
      JSON.parse(JSON.stringify(await exportBackup(a.getState().getDb()))),
    );
    expect(file?.data.notes).toHaveLength(1);
    expect(file?.data.sketches).toHaveLength(1);

    const b = await fresh();
    await b.getState().importFromBackup(file!);
    expect(b.getState().notes.map((n) => n.text)).toEqual(['hello']);
    expect(b.getState().sketches[0]!.strokes[0]!.id).toBe('x');
    expect(validateBackup({ ...file, data: { ...file!.data, notes: [{ nope: 1 }] } })).toBeNull();
  });
});
