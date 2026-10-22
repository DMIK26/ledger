import { normalizeMerchantKey } from './categoriser';
import { addDays, monthBounds, monthKey, monthProgress, weekdayOf } from './dates';
import type { Category, ISODate, Transaction } from './types';

/**
 * The pencil's wry one-liners (Drop 11, opt-in): short, kind remarks about the month, written here,
 * no AI and no server. They never name amounts, so privacy mode has nothing to hide, and never scold.
 */

const DRINKS = /\b(?:chai|tea|coffee|cappuccino|latte|espresso|filter coffee)\b/i;

export function wryLines(input: {
  transactions: readonly Pick<Transaction, 'date' | 'amountMinor' | 'merchant' | 'categoryId'>[];
  categories: readonly Pick<Category, 'id' | 'name'>[];
  noSpendDays: readonly ISODate[];
  overallBudgetMinor: number | null;
  today: ISODate;
}): string[] {
  const { today } = input;
  const month = monthKey(today);
  const { start } = monthBounds(month);
  const list = input.transactions.filter((t) => t.date >= start && t.date <= today);
  const out: string[] = [];
  if (list.length === 0) return out;
  const total = list.reduce((s, t) => s + t.amountMinor, 0);

  const visits = new Map<string, { name: string; days: Set<string> }>();
  for (const t of list) {
    const key = normalizeMerchantKey(t.merchant);
    if (!key) continue;
    const v = visits.get(key) ?? { name: t.merchant, days: new Set<string>() };
    v.days.add(t.date);
    visits.set(key, v);
  }
  const regular = [...visits.values()].sort((a, b) => b.days.size - a.days.size)[0];
  if (regular && regular.days.size >= 5)
    out.push(
      `${regular.name} has seen you ${regular.days.size} times this month. It may know your order by now.`,
    );

  const rest = input.noSpendDays.filter((d) => d >= start && d <= today).length;
  if (rest >= 2) out.push(`${rest} no-spend days this month. Your wallet enjoyed the quiet.`);

  const drinks = list.filter((t) => DRINKS.test(t.merchant)).length;
  if (drinks >= 8)
    out.push(`${drinks} chai and coffee stops this month. Well caffeinated, well logged.`);

  let weekend = 0;
  let weekday = 0;
  for (const t of list) {
    const w = weekdayOf(t.date);
    if (w === 0 || w === 6) weekend += t.amountMinor;
    else weekday += t.amountMinor;
  }
  if (weekend > weekday && weekend > 0 && list.length >= 6)
    out.push('Weekends are doing most of the spending this month. Weekdays are taking it easy.');

  const { day, length } = monthProgress(today);
  if (
    input.overallBudgetMinor &&
    day >= 7 &&
    total < (input.overallBudgetMinor * day * 0.7) / length
  )
    out.push("Spending is well behind the budget's pace. Very composed.");

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const logged = new Set(input.transactions.map((t) => t.date));
  if (week.every((d) => logged.has(d) || input.noSpendDays.includes(d)))
    out.push('Something noted every day this week. The pencil approves.');

  const byCat = new Map<string, number>();
  for (const t of list) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountMinor);
  const top = [...byCat].sort((a, b) => b[1] - a[1])[0];
  if (top && total > 0 && top[1] / total > 0.5 && list.length >= 5) {
    const name = input.categories.find((c) => c.id === top[0])?.name ?? 'Other';
    out.push(`${name} is more than half of the month so far. It knows it is the favourite.`);
  }
  return out;
}

/** One line, picked by `seed` so the same moment says the same thing; null when nothing fits. */
export function wryLine(lines: readonly string[], seed: number): string | null {
  if (lines.length === 0) return null;
  return lines[Math.abs(Math.floor(seed)) % lines.length]!;
}
