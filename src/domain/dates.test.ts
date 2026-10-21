import { describe, expect, it } from 'vitest';
import {
  addDays, daysInMonth, diffDays, fmtDate, fyOf, isValidYMD, parseISO, shiftMonth, todayISO, weekdayOf,
} from './dates';

describe('dates', () => {
  it('uses the local calendar date, not UTC', () => {
    expect(todayISO(new Date(2026, 9, 19, 0, 30))).toBe('2026-10-19');
    expect(todayISO(new Date(2026, 9, 19, 23, 59))).toBe('2026-10-19');
  });
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
  it('knows month lengths, leap years and weekdays', () => {
    expect(daysInMonth(2026, 9)).toBe(30);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(isValidYMD(2026, 9, 31)).toBe(false);
    expect(weekdayOf('2026-10-19')).toBe(1);
    expect(diffDays('2026-10-19', '2026-10-16')).toBe(3);
  });
  it('parses and formats', () => {
    expect(parseISO('2026-02-30')).toBeNull();
    expect(fmtDate('2026-10-18')).toBe('18 Oct 2026');
    expect(shiftMonth(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
  });
  it('puts March in the previous financial year and 1 April in a new one', () => {
    expect(fyOf('2026-03-31').label).toBe('FY 2025-26');
    expect(fyOf('2026-04-01').label).toBe('FY 2026-27');
    expect(fyOf('2026-10-19')).toMatchObject({ start: '2026-04-01', end: '2027-03-31' });
    expect(fyOf('2026-10-19', 1).label).toBe('2026');
  });
});
