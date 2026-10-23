import { lastMonths, monthSeries } from './aggregates';
import { normalizeMerchantKey } from './categoriser';
import { addDays, daysInMonth, diffDays, isoFromYMD, parseISO, weekdayOf } from './dates';
import type { RelativeRange } from './periods';
import type { CategoryId, ISODate, PaymentMethod, Transaction } from './types';

export const inRange = (
  list: readonly Transaction[],
  start: ISODate,
  end: ISODate,
): Transaction[] => list.filter((t) => t.date >= start && t.date <= end);

export interface CategoryRow {
  categoryId: CategoryId;
  totalMinor: number;
  compareMinor: number;
  /** Share of the period total, 0 to 1. */
  share: number;
  /** Six monthly totals ending with the period's last month, for the sparkline. */
  series: number[];
}

export interface MerchantRow {
  merchant: string;
  count: number;
  totalMinor: number;
}

export interface MethodRow {
  method: PaymentMethod;
  count: number;
  totalMinor: number;
}

export interface WeekdayRow {
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  totalMinor: number;
  /** Average spend on each such day in the range, entries or not. */
  averageMinor: number;
}

export interface DayCell {
  date: ISODate;
  totalMinor: number;
}

export interface Report {
  start: ISODate;
  end: ISODate;
  compareStart: ISODate;
  compareEnd: ISODate;
  totalMinor: number;
  compareMinor: number;
  changePct: number | null;
  entries: number;
  categories: CategoryRow[];
  merchants: MerchantRow[];
  methods: MethodRow[];
  weekdays: WeekdayRow[];
  days: DayCell[];
}

const sum = (list: readonly Transaction[]) => list.reduce((s, t) => s + t.amountMinor, 0);

/** Everything the Reports page shows for one range, compared with another range. */
export function buildReport(
  list: readonly Transaction[],
  range: { start: ISODate; end: ISODate },
  compare: { start: ISODate; end: ISODate },
): Report {
  const current = inRange(list, range.start, range.end);
  const previous = inRange(list, compare.start, compare.end);
  const totalMinor = sum(current);
  const compareMinor = sum(previous);

  const byCat = new Map<CategoryId, { now: number; before: number }>();
  for (const t of current) {
    const r = byCat.get(t.categoryId) ?? { now: 0, before: 0 };
    r.now += t.amountMinor;
    byCat.set(t.categoryId, r);
  }
  for (const t of previous) {
    const r = byCat.get(t.categoryId) ?? { now: 0, before: 0 };
    r.before += t.amountMinor;
    byCat.set(t.categoryId, r);
  }
  const months = lastMonths(range.end, 6);
  const series = monthSeries(
    list.filter((t) => t.date <= range.end),
    months,
  );
  const categories: CategoryRow[] = [...byCat.entries()]
    .map(([categoryId, r]) => ({
      categoryId,
      totalMinor: r.now,
      compareMinor: r.before,
      share: totalMinor > 0 ? r.now / totalMinor : 0,
      series: series.map((p) => p.byCategory[categoryId] ?? 0),
    }))
    .sort((a, b) => b.totalMinor - a.totalMinor || b.compareMinor - a.compareMinor);

  const merchantMap = new Map<string, MerchantRow>();
  for (const t of current) {
    const key = normalizeMerchantKey(t.merchant) || '(none)';
    const r = merchantMap.get(key) ?? {
      merchant: t.merchant || 'Untitled',
      count: 0,
      totalMinor: 0,
    };
    r.count += 1;
    r.totalMinor += t.amountMinor;
    merchantMap.set(key, r);
  }
  const merchants = [...merchantMap.values()]
    .sort((a, b) => b.totalMinor - a.totalMinor)
    .slice(0, 8);

  const methodMap = new Map<PaymentMethod, MethodRow>();
  for (const t of current) {
    const r = methodMap.get(t.method) ?? { method: t.method, count: 0, totalMinor: 0 };
    r.count += 1;
    r.totalMinor += t.amountMinor;
    methodMap.set(t.method, r);
  }
  const methods = [...methodMap.values()].sort((a, b) => b.totalMinor - a.totalMinor);

  const days: DayCell[] = [];
  const dayTotals = new Map<ISODate, number>();
  for (const t of current) dayTotals.set(t.date, (dayTotals.get(t.date) ?? 0) + t.amountMinor);
  const length = diffDays(range.end, range.start) + 1;
  for (let i = 0; i < length; i += 1) {
    const date = addDays(range.start, i);
    days.push({ date, totalMinor: dayTotals.get(date) ?? 0 });
  }

  // Monday first, as Indian calendars print the week.
  const weekdays: WeekdayRow[] = [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
    const matching = days.filter((d) => weekdayOf(d.date) === weekday);
    const total = matching.reduce((s, d) => s + d.totalMinor, 0);
    return {
      weekday,
      totalMinor: total,
      averageMinor: matching.length > 0 ? Math.round(total / matching.length) : 0,
    };
  });

  return {
    start: range.start,
    end: range.end,
    compareStart: compare.start,
    compareEnd: compare.end,
    totalMinor,
    compareMinor,
    changePct:
      compareMinor > 0 ? Math.round(((totalMinor - compareMinor) / compareMinor) * 100) : null,
    entries: current.length,
    categories,
    merchants,
    methods,
    weekdays,
    days,
  };
}

/**
 * The 12 months before a range (Drop 11 compare mode): from a year before the range starts to the day
 * before it. With an April-to-March year and a range starting 1 Oct, that is 1 Oct last year to 30 Sep.
 */
export function averageWindow(start: ISODate): { start: ISODate; end: ISODate } {
  const p = parseISO(start)!;
  return {
    start: isoFromYMD(p.y - 1, p.m, Math.min(p.d, daysInMonth(p.y - 1, p.m))),
    end: addDays(start, -1),
  };
}

/**
 * Turns a report compared against a long window into one compared against the window's average for the
 * same number of days: every compared figure is scaled by the range's days over the window's days.
 */
export function scaleCompare(report: Report, rangeDays: number): Report {
  const windowDays = diffDays(report.compareEnd, report.compareStart) + 1;
  const f = windowDays > 0 ? rangeDays / windowDays : 0;
  const compareMinor = Math.round(report.compareMinor * f);
  return {
    ...report,
    compareMinor,
    changePct:
      compareMinor > 0
        ? Math.round(((report.totalMinor - compareMinor) / compareMinor) * 100)
        : null,
    categories: report.categories.map((c) => ({
      ...c,
      compareMinor: Math.round(c.compareMinor * f),
    })),
  };
}

/** A report kept under a name (Drop 12). Month, quarter and year keep their offset from today. */
export interface SavedReport {
  id: string;
  name: string;
  range:
    | { kind: 'month' | 'quarter' | 'fy'; offset: number }
    | { kind: 'relative'; id: RelativeRange }
    | { kind: 'custom'; start: ISODate; end: ISODate };
  compare: 'previous' | 'lastYear' | 'average';
  createdAt: number;
}
