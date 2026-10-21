import { describe, expect, it } from 'vitest';
import { highlightSegments } from './highlight';
import { parseQuickEntry } from './parser';

const segs = (text: string) =>
  highlightSegments(parseQuickEntry(text, { today: '2026-10-19' }))
    .filter((s) => s.kind)
    .map((s) => [s.kind, s.text.trim()]);

describe('quick-add highlighting', () => {
  it('marks amount, date, method and a recognised merchant', () => {
    const out = segs('shawarma 500 on 18th oct upi');
    expect(out).toContainEqual(['category', 'shawarma']);
    expect(out.find((s) => s[0] === 'amount')?.[1]).toBe('500');
    expect(out.some((s) => s[0] === 'date' && s[1]!.includes('18th oct'))).toBe(true);
    expect(out).toContainEqual(['method', 'upi']);
  });
  it('leaves an unknown merchant plain', () => {
    expect(segs('xyzcorp 700').some((s) => s[0] === 'category')).toBe(false);
  });
  it('keeps the full text when the parser rewrote number words', () => {
    const all = highlightSegments(parseQuickEntry('tea two fifty', { today: '2026-10-19' }));
    expect(all.map((s) => s.text).join('')).toBe('tea two fifty');
  });
});
