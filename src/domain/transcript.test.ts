import { describe, expect, it } from 'vitest';
import { mergeTranscripts } from './transcript';
import { parseQuickEntry } from './parser';

describe('mergeTranscripts', () => {
  it('joins separate segments (Chrome)', () => {
    expect(mergeTranscripts(['chai', 'twenty cash'])).toBe('chai twenty cash');
  });

  it('does not repeat cumulative results (Safari on iPhone)', () => {
    expect(mergeTranscripts(['Chai', 'Chai 20', 'Chai 20 cash'])).toBe('Chai 20 cash');
    expect(mergeTranscripts(['Chai 20 cash', 'chai 20 cash'])).toBe('Chai 20 cash');
    expect(mergeTranscripts(['Chai 20 cash', 'cash'])).toBe('Chai 20 cash');
  });

  it('drops dictation punctuation at the end and extra spaces', () => {
    expect(mergeTranscripts(['  Uber 240   by card. '])).toBe('Uber 240 by card');
    expect(mergeTranscripts(['', '  '])).toBe('');
  });

  it('what iPhone dictation produces parses as intended', () => {
    const opts = { today: '2026-10-22', lastMethod: 'UPI' as const, rules: {} };
    for (const [said, merchant, amount, method] of [
      [['Chai ₹20 cash.'], 'Chai', 2000, 'Cash'],
      [['Swiggy', 'Swiggy 350 rupees', 'Swiggy 350 rupees UPI.'], 'Swiggy', 35000, 'UPI'],
      [['Dinner, 1,200 rupees, by card.'], 'Dinner', 120000, 'Card'],
    ] as const) {
      const p = parseQuickEntry(mergeTranscripts(said), opts);
      expect([p.merchant, p.amountMinor, p.method]).toEqual([merchant, amount, method]);
    }
  });
});
