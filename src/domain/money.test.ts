import { afterEach, describe, expect, it } from 'vitest';
import { fmtMoney, maskedMoney, parseAmountToMinor, setPrivacy } from './money';

afterEach(() => setPrivacy(false));

describe('money', () => {
  it('formats with Indian grouping by default', () => {
    expect(fmtMoney(3759900)).toBe('₹37,599.00');
    expect(fmtMoney(123456789)).toBe('₹12,34,567.89');
    expect(fmtMoney(-50000)).toBe('-₹500.00');
  });
  it('formats other currencies', () => {
    expect(fmtMoney(123456, { currency: 'USD' })).toBe('$1,234.56');
  });
  it('parses decimals into integers without float error', () => {
    expect(parseAmountToMinor('1,200.50')).toBe(120050);
    expect(parseAmountToMinor('0.1')).toBe(10);
    expect(parseAmountToMinor('19.999')).toBe(2000);
    expect(parseAmountToMinor('abc')).toBeNull();
  });
  it('shows a fixed-shape mask while privacy is on, with no real digits', () => {
    setPrivacy(true);
    const shown = fmtMoney(3759900);
    expect(shown).toBe(maskedMoney());
    expect(shown.replace(/[^0-9]/g, '')).toMatch(/^8+$/);
    expect(fmtMoney(3759900, { compact: true })).toBe('₹88k');
    expect(fmtMoney(3759900, { reveal: true })).toBe('₹37,599.00');
  });
});
