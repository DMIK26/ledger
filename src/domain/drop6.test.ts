import { afterEach, describe, expect, it } from 'vitest';
import {
  detectShape,
  fitCap,
  hitsStroke,
  simplify,
  sketchBytes,
  strokePath,
  type Pt,
  type Stroke,
} from './sketch';
import {
  answer,
  autoAnnotation,
  companionMood,
  insightSentence,
  type AskContext,
} from './companion';
import { anchorLabel, cleanNote, noteText, parseAnchor } from './notes';
import { setPrivacy } from './money';
import { DEFAULT_CATEGORIES } from './categories';
import type { Transaction } from './types';

const tx = (
  id: string,
  date: string,
  amountMinor: number,
  categoryId = 'food',
  merchant = id,
): Transaction => ({
  id,
  date,
  amountMinor,
  currency: 'INR',
  merchant,
  categoryId,
  method: 'UPI',
  notes: '',
  tags: [],
  source: 'quick',
  createdAt: 1,
  updatedAt: 1,
});

const circle = (cx: number, cy: number, r: number, n = 60, jitter = 0): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const j = jitter * Math.sin(i * 7);
    return [cx + (r + j) * Math.cos(a), cy + (r + j) * Math.sin(a), 0.5];
  });

afterEach(() => setPrivacy(false));

describe('sketch geometry', () => {
  it('simplify drops points on a straight run and keeps corners (epsilon 0.8)', () => {
    const pts: Pt[] = [];
    for (let x = 0; x <= 100; x += 2) pts.push([x, 0, 0.5]);
    for (let y = 2; y <= 100; y += 2) pts.push([100, y, 0.5]);
    const out = simplify(pts);
    expect(out.map((p) => [p[0], p[1]])).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
  });

  it('simplify keeps detail larger than the tolerance', () => {
    const out = simplify([
      [0, 0, 0.5],
      [10, 2, 0.5],
      [20, 0, 0.5],
    ]);
    expect(out).toHaveLength(3);
    const flat = simplify([
      [0, 0, 0.5],
      [10, 0.5, 0.5],
      [20, 0, 0.5],
    ]);
    expect(flat).toHaveLength(2);
  });

  it('snaps a nearly straight stroke to a line', () => {
    const pts: Pt[] = Array.from({ length: 30 }, (_, i) => [i * 5, Math.sin(i) * 1.5, 0.5]);
    const s = detectShape(pts);
    expect(s?.kind).toBe('line');
    expect(s?.points).toHaveLength(2);
  });

  it('snaps a wobbly closed loop to a circle', () => {
    const s = detectShape(circle(100, 100, 40, 60, 2));
    expect(s?.kind).toBe('circle');
    expect(s?.points).toHaveLength(37);
  });

  it('snaps a closed box to a rectangle', () => {
    const pts: Pt[] = [];
    for (let x = 0; x <= 80; x += 4) pts.push([x, 0, 0.5]);
    for (let y = 4; y <= 50; y += 4) pts.push([80, y, 0.5]);
    for (let x = 76; x >= 0; x -= 4) pts.push([x, 50, 0.5]);
    for (let y = 46; y >= 0; y -= 4) pts.push([0, y, 0.5]);
    const s = detectShape(pts);
    expect(s?.kind).toBe('rect');
    expect(s?.points[0]).toEqual([0, 0, 0.5]);
    expect(s?.points[2]).toEqual([80, 50, 0.5]);
  });

  it('leaves scribbles and tiny marks alone', () => {
    expect(
      detectShape([
        [0, 0, 0.5],
        [3, 3, 0.5],
        [5, 1, 0.5],
      ]),
    ).toBeNull();
    const zig: Pt[] = Array.from({ length: 30 }, (_, i) => [i * 4, i % 2 ? 30 : 0, 0.5]);
    expect(detectShape(zig)).toBeNull();
  });

  it('fitCap keeps a drawing under 200KB by dropping the oldest strokes', () => {
    const big = (id: string): Stroke => ({
      id,
      tool: 'pen',
      color: 'ink',
      points: Array.from({ length: 2000 }, (_, i) => [i + 0.5, i + 0.5, 0.5] as Pt),
    });
    const strokes = Array.from({ length: 12 }, (_, i) => big(`s${i}`));
    expect(sketchBytes(strokes)).toBeGreaterThan(200 * 1024);
    const kept = fitCap(strokes);
    expect(sketchBytes(kept)).toBeLessThanOrEqual(200 * 1024);
    expect(kept.at(-1)!.id).toBe('s11');
    expect(kept[0]!.id).not.toBe('s0');
  });

  it('draws paths and finds strokes under the eraser', () => {
    const s: Stroke = {
      id: 'a',
      tool: 'pen',
      color: 'ink',
      points: [
        [0, 0, 0.5],
        [100, 0, 0.5],
      ],
    };
    expect(strokePath(s.points)).toBe('M0 0L100 0');
    expect(hitsStroke(s, 50, 6, 8)).toBe(true);
    expect(hitsStroke(s, 50, 30, 8)).toBe(false);
  });
});

describe('the pencil', () => {
  it('moods follow the budget: relaxed under 80%, worried 80 to 100%, dizzy over, asleep when idle', () => {
    expect(companionMood(79_000, 100_000, false)).toBe('relaxed');
    expect(companionMood(80_000, 100_000, false)).toBe('worried');
    expect(companionMood(100_000, 100_000, false)).toBe('worried');
    expect(companionMood(100_100, 100_000, false)).toBe('dizzy');
    expect(companionMood(500_000, null, false)).toBe('relaxed');
    expect(companionMood(100_100, 100_000, true)).toBe('asleep');
  });

  const ctx = (over: Partial<AskContext> = {}): AskContext => ({
    transactions: [
      tx('a', '2026-10-02', 40_000, 'food', 'Swiggy'),
      tx('b', '2026-10-05', 800_000, 'housing', 'Rent'),
      tx('c', '2026-10-05', 10_000, 'food', 'Chai'),
      tx('d', '2026-09-05', 99_999_00, 'food', 'Old'),
    ],
    categories: DEFAULT_CATEGORIES,
    recurring: [],
    overallBudgetMinor: null,
    month: '2026-10',
    today: '2026-10-19',
    currency: 'INR',
    ...over,
  });

  it('answers point at the thing on the page', () => {
    expect(answer('where', ctx())).toEqual({
      text: 'Most of it went on Housing & Utilities: ₹8,000.00.',
      anchor: 'category:housing',
    });
    expect(answer('biggest', ctx()).anchor).toBe('tx:b');
    expect(answer('busiest', ctx())).toEqual({
      text: '5 Oct 2026: ₹8,100.00.',
      anchor: 'day:2026-10-05',
    });
    expect(answer('budget', ctx()).anchor).toBeNull();
    expect(answer('budget', ctx({ overallBudgetMinor: 500_000 })).text).toBe(
      'Over by ₹3,500.00 already. Slower days from here.',
    );
  });

  it('answers and captions hide amounts in privacy mode', () => {
    setPrivacy(true);
    const where = answer('where', ctx()).text;
    expect(where).not.toMatch(/8,000/);
    const auto = autoAnnotation('/transactions', ctx());
    expect(auto?.anchor).toBe('tx:b');
    expect(auto?.text).toBe('the big one, ₹88k');
    expect(
      insightSentence(
        { kind: 'largest', tx: tx('b', '2026-10-05', 800_000) },
        DEFAULT_CATEGORIES,
        'INR',
      ),
    ).not.toMatch(/8,000/);
  });

  it('each page gets one auto-annotation at the most notable thing', () => {
    expect(autoAnnotation('/', ctx())?.anchor).toBe('category:housing');
    expect(autoAnnotation('/reports', ctx())?.anchor).toBe('day:2026-10-05');
    expect(autoAnnotation('/budgets', ctx(), { food: 40_000, housing: 2_000_000 })).toEqual({
      text: 'this one ran over',
      anchor: 'budget:food',
    });
    expect(autoAnnotation('/settings', ctx())).toBeNull();
  });
});

describe('notes', () => {
  it('anchors parse and read in plain words', () => {
    expect(parseAnchor('budget:overall')).toEqual({ kind: 'budget', id: 'overall' });
    expect(parseAnchor('nonsense')).toBeNull();
    expect(anchorLabel('category:food', DEFAULT_CATEGORIES)).toBe('Food & Dining');
    expect(anchorLabel('month:2026-10', DEFAULT_CATEGORIES)).toBe('October 2026');
    expect(anchorLabel('budget:food', DEFAULT_CATEGORIES)).toBe('Food & Dining budget');
    expect(anchorLabel('tx:x', DEFAULT_CATEGORIES)).toBe('A deleted entry');
  });

  it('privacy mode hides numbers in notes; notes are trimmed and capped', () => {
    expect(noteText('rent went up 500')).toBe('rent went up 500');
    setPrivacy(true);
    expect(noteText('rent went up 1,500.50 this time')).toBe('rent went up ••• this time');
    expect(cleanNote('  hi  ')).toBe('hi');
    expect(cleanNote('x'.repeat(400))).toHaveLength(280);
  });
});
