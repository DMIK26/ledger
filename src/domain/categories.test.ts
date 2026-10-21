import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, nextUnusedColor } from './categories';
import { categorise, withinOneEdit } from './categoriser';
import { replaceNumberWords } from './numberWords';

describe('categories', () => {
  it('gives every default category its own colour', () => {
    const colours = DEFAULT_CATEGORIES.map((c) => c.color);
    expect(new Set(colours).size).toBe(colours.length);
  });
  it('hands a custom category the next unused colour', () => {
    const used = DEFAULT_CATEGORIES.slice(0, 3).map((c) => c.color);
    expect(used).not.toContain(nextUnusedColor(used));
  });
  it('matches typos within one edit', () => {
    expect(withinOneEdit('shawerma', 'shawarma')).toBe(true);
    expect(withinOneEdit('shawarma', 'shawarm')).toBe(true);
    expect(withinOneEdit('shawarma', 'shaverma')).toBe(false);
    expect(withinOneEdit('shawarma', 'pizza')).toBe(false);
  });
  it('picks the entertainment category for a movie ticket', () => {
    expect(categorise('movie ticket').categoryId).toBe('entertainment');
  });
});

describe('number words', () => {
  it('converts spoken amounts', () => {
    expect(replaceNumberWords('dinner two fifty')).toBe('dinner 250');
    expect(replaceNumberWords('five hundred rupees')).toBe('500 rupees');
    expect(replaceNumberWords('chai twenty')).toBe('chai 20');
    expect(replaceNumberWords('two thousand five hundred')).toBe('2500');
  });
  it('leaves merchant names alone', () => {
    expect(replaceNumberWords('Cafe One')).toBe('Cafe One');
    expect(replaceNumberWords('three friends')).toBe('three friends');
  });
});
