import { categoryTotals, inMonth, previousMonth } from './aggregates';
import { budgetStatus, projectMonthEnd } from './budgets';
import { addDays, daysInMonth, isoFromYMD, monthKey, parseISO } from './dates';
import { nextOccurrence, type RecurringItem } from './recurring';
import type { CategoryId, ISODate, Transaction } from './types';

export type Insight =
  | { kind: 'pace-over'; projectedMinor: number; overMinor: number }
  | { kind: 'pace-under'; projectedMinor: number; leftMinor: number }
  | { kind: 'category-up'; categoryId: CategoryId; deltaMinor: number; pct: number }
  | { kind: 'category-down'; categoryId: CategoryId; deltaMinor: number; pct: number }
  | { kind: 'largest'; tx: Transaction }
  | { kind: 'upcoming'; count: number; totalMinor: number; merchant: string; date: ISODate }
  | { kind: 'quiet-days'; days: number };

const MIN_CHANGE = 50_000; // ₹500: smaller moves are noise

/** Up to four short observations for the Dashboard, most useful first. Pure and deterministic. */
export function buildInsights(
  list: readonly Transaction[],
  today: ISODate,
  overallBudgetMinor: number | null,
  recurring: readonly RecurringItem[] = [],
): Insight[] {
  const p = parseISO(today)!;
  const month = monthKey(today);
  const current = inMonth(list, month).filter((t) => t.date <= today);
  const out: Insight[] = [];

  const spent = current.reduce((s, t) => s + t.amountMinor, 0);
  if (overallBudgetMinor !== null && spent > 0 && p.d < daysInMonth(p.y, p.m)) {
    const projected = projectMonthEnd(spent, today);
    const s = budgetStatus(projected, overallBudgetMinor);
    out.push(
      s.kind === 'over'
        ? { kind: 'pace-over', projectedMinor: projected, overMinor: s.overMinor }
        : { kind: 'pace-under', projectedMinor: projected, leftMinor: s.leftMinor },
    );
  }

  const last = previousMonth(month);
  const [ly, lm] = last.split('-').map(Number);
  const cutoff = isoFromYMD(ly!, lm!, Math.min(p.d, daysInMonth(ly!, lm!)));
  const before = new Map(
    categoryTotals(
      inMonth(list, last).filter((t) => t.date <= cutoff),
      last,
    ).map((c) => [c.categoryId, c.totalMinor]),
  );
  const now = new Map(categoryTotals(current, month).map((c) => [c.categoryId, c.totalMinor]));
  const ids = new Set([...before.keys(), ...now.keys()]);
  const deltas = [...ids]
    .map((id) => ({ id, a: before.get(id) ?? 0, b: now.get(id) ?? 0 }))
    .map((d) => ({ ...d, delta: d.b - d.a }));
  const up = deltas
    .filter((d) => d.delta >= MIN_CHANGE && d.a > 0 && d.delta / d.a >= 0.25)
    .sort((x, y) => y.delta - x.delta)[0];
  if (up)
    out.push({
      kind: 'category-up',
      categoryId: up.id,
      deltaMinor: up.delta,
      pct: Math.round((up.delta / up.a) * 100),
    });

  const soon = recurring
    .map((r) => ({ r, date: nextOccurrence(r, today) }))
    .filter((x) => x.date >= today && x.date <= addDays(today, 7))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (soon.length > 0) {
    out.push({
      kind: 'upcoming',
      count: soon.length,
      totalMinor: soon.reduce((s, x) => s + x.r.amountMinor, 0),
      merchant: soon[0]!.r.merchant,
      date: soon[0]!.date,
    });
  }

  const largest = [...current].sort((a, b) => b.amountMinor - a.amountMinor)[0];
  if (largest && current.length >= 3) out.push({ kind: 'largest', tx: largest });

  const down = deltas
    .filter((d) => -d.delta >= MIN_CHANGE && d.a > 0 && -d.delta / d.a >= 0.25)
    .sort((x, y) => x.delta - y.delta)[0];
  if (down)
    out.push({
      kind: 'category-down',
      categoryId: down.id,
      deltaMinor: -down.delta,
      pct: Math.round((-down.delta / down.a) * 100),
    });

  if (current.length > 0) {
    const daysWith = new Set(current.map((t) => t.date)).size;
    const quiet = p.d - daysWith;
    if (quiet >= 3) out.push({ kind: 'quiet-days', days: quiet });
  }

  return out.slice(0, 4);
}
