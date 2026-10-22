import type { Account, Flow } from './accounts';
import { nextDateOnDay } from './accounts';
import { addDays, diffDays, monthBounds, parseISO, weekdayOf } from './dates';
import { occurrencesBetween, type RecurringItem } from './recurring';
import type { CategoryId, ISODate, Transaction } from './types';

/** Drop 11: the month as a calendar, and the sketchbook that fills as days are logged. */

export interface CalendarDay {
  date: ISODate;
  /** Day of the calendar month (1 to 31). */
  day: number;
  /** Inside the month being shown (days from the weeks around it are shown faded). */
  inMonth: boolean;
  isToday: boolean;
  spentMinor: number;
  entries: number;
  bills: Array<{ id: string; merchant: string; amountMinor: number }>;
  income: Array<{ id: string; label: string; amountMinor: number }>;
  cardsDue: Array<{ id: string; name: string }>;
  noSpend: boolean;
}

export interface CalendarInput {
  transactions: readonly Pick<Transaction, 'date' | 'amountMinor'>[];
  flows: readonly Pick<Flow, 'id' | 'kind' | 'date' | 'amountMinor' | 'label'>[];
  recurring: readonly RecurringItem[];
  accounts: readonly Pick<Account, 'id' | 'name' | 'kind' | 'dueDay' | 'archived'>[];
  noSpendDays: readonly ISODate[];
  today: ISODate;
}

/** Monday on or before a date. */
export const weekStart = (iso: ISODate): ISODate => addDays(iso, -((weekdayOf(iso) + 6) % 7));

/** The month in whole weeks, Monday first, each day with what happened or is due on it. */
export function calendarWeeks(month: string, input: CalendarInput): CalendarDay[][] {
  const { start, end } = monthBounds(month);
  const first = weekStart(start);
  const last = addDays(weekStart(end), 6);
  const length = diffDays(last, first) + 1;
  const days = new Map<ISODate, CalendarDay>();
  for (let i = 0; i < length; i += 1) {
    const date = addDays(first, i);
    days.set(date, {
      date,
      day: parseISO(date)!.d,
      inMonth: date >= start && date <= end,
      isToday: date === input.today,
      spentMinor: 0,
      entries: 0,
      bills: [],
      income: [],
      cardsDue: [],
      noSpend: input.noSpendDays.includes(date),
    });
  }
  for (const t of input.transactions) {
    const d = days.get(t.date);
    if (!d) continue;
    d.spentMinor += t.amountMinor;
    d.entries += 1;
  }
  for (const f of input.flows) {
    const d = days.get(f.date);
    if (d && f.kind === 'income')
      d.income.push({ id: f.id, label: f.label, amountMinor: f.amountMinor });
  }
  for (const r of input.recurring) {
    for (const date of occurrencesBetween(r, first, length))
      days.get(date)?.bills.push({ id: r.id, merchant: r.merchant, amountMinor: r.amountMinor });
  }
  for (const a of input.accounts) {
    if (a.kind !== 'card' || !a.dueDay || a.archived) continue;
    for (
      let d = nextDateOnDay(addDays(first, -1), a.dueDay);
      d <= last;
      d = nextDateOnDay(d, a.dueDay)
    )
      days.get(d)?.cardsDue.push({ id: a.id, name: a.name });
  }
  const list = [...days.values()];
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < list.length; i += 7) weeks.push(list.slice(i, i + 7));
  return weeks;
}

export type SketchDay =
  | { date: ISODate; day: number; kind: 'drawn'; categoryId: CategoryId }
  | { date: ISODate; day: number; kind: 'rest' | 'blank' | 'future' };

/**
 * The sketchbook page for a month: each logged day gets a drawing of its biggest category, a day marked
 * "no spend" gets a resting doodle, and days still to come stay blank.
 */
export function sketchbookDays(
  month: string,
  transactions: readonly Pick<Transaction, 'date' | 'amountMinor' | 'categoryId'>[],
  noSpendDays: readonly ISODate[],
  today: ISODate,
): SketchDay[] {
  const { start, end } = monthBounds(month);
  const byDay = new Map<ISODate, Map<CategoryId, number>>();
  for (const t of transactions) {
    if (t.date < start || t.date > end) continue;
    const m = byDay.get(t.date) ?? new Map<CategoryId, number>();
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amountMinor);
    byDay.set(t.date, m);
  }
  const out: SketchDay[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const day = parseISO(date)!.d;
    const cats = byDay.get(date);
    if (cats) {
      const top = [...cats.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
      out.push({ date, day, kind: 'drawn', categoryId: top[0] });
    } else if (noSpendDays.includes(date)) out.push({ date, day, kind: 'rest' });
    else out.push({ date, day, kind: date > today ? 'future' : 'blank' });
  }
  return out;
}
