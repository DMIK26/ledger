import { INCOME_KINDS, type Flow, type IncomeKind } from './accounts';
import { normalizeMerchantKey } from './categoriser';
import type { Category, CategoryId, ISODate, Transaction } from './types';
import { tl } from './i18n';

/**
 * Money flow (Drop 11, after Monarch's Sankey): money in on the left, where it went in the middle, and,
 * for one chosen category, its merchants on the right. Pure data; the chart lays it out.
 */

export type FlowNodeKind = 'income' | 'savings' | 'category' | 'rest' | 'left' | 'merchant';

export interface FlowNode {
  id: string;
  label: string;
  valueMinor: number;
  column: 0 | 1 | 2;
  kind: FlowNodeKind;
  categoryId?: CategoryId;
}

export interface FlowLink {
  source: string;
  target: string;
  valueMinor: number;
}

export interface MoneyFlow {
  nodes: FlowNode[];
  links: FlowLink[];
  inMinor: number;
  spentMinor: number;
}

export const MAX_FLOW_CATEGORIES = 6;
const MAX_MERCHANTS = 4;

export function moneyFlow(input: {
  transactions: readonly Pick<Transaction, 'date' | 'amountMinor' | 'categoryId' | 'merchant'>[];
  flows: readonly Pick<Flow, 'kind' | 'date' | 'amountMinor' | 'incomeKind'>[];
  categories: readonly Pick<Category, 'id' | 'name'>[];
  start: ISODate;
  end: ISODate;
  /** A category whose merchants are shown in a third column. */
  expand?: CategoryId | null;
}): MoneyFlow {
  const within = (d: ISODate) => d >= input.start && d <= input.end;
  const spending = input.transactions.filter((t) => within(t.date));
  const income = new Map<IncomeKind, number>();
  for (const f of input.flows) {
    if (f.kind !== 'income' || !within(f.date)) continue;
    const k = f.incomeKind ?? 'other';
    income.set(k, (income.get(k) ?? 0) + f.amountMinor);
  }
  const inMinor = [...income.values()].reduce((a, b) => a + b, 0);
  const byCat = new Map<CategoryId, number>();
  for (const t of spending) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountMinor);
  const spentMinor = [...byCat.values()].reduce((a, b) => a + b, 0);
  const name = (id: CategoryId) => input.categories.find((c) => c.id === id)?.name ?? tl('Other');

  const nodes: FlowNode[] = [];
  for (const [k, v] of [...income.entries()].sort((a, b) => b[1] - a[1]))
    nodes.push({ id: `in:${k}`, label: INCOME_KINDS[k], valueMinor: v, column: 0, kind: 'income' });
  if (spentMinor > inMinor)
    nodes.push({
      id: 'savings',
      label: inMinor === 0 ? tl('Spending') : tl('Not covered by money in'),
      valueMinor: spentMinor - inMinor,
      column: 0,
      kind: 'savings',
    });

  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = cats.slice(0, MAX_FLOW_CATEGORIES);
  const rest = cats.slice(MAX_FLOW_CATEGORIES).reduce((s, [, v]) => s + v, 0);
  for (const [id, v] of shown)
    nodes.push({
      id: `cat:${id}`,
      label: name(id),
      valueMinor: v,
      column: 1,
      kind: 'category',
      categoryId: id,
    });
  if (rest > 0)
    nodes.push({
      id: 'cat:rest',
      label: tl('Other categories'),
      valueMinor: rest,
      column: 1,
      kind: 'rest',
    });
  if (inMinor > spentMinor)
    nodes.push({
      id: 'left',
      label: tl('Left over'),
      valueMinor: inMinor - spentMinor,
      column: 1,
      kind: 'left',
    });

  // Every source shares itself across the middle column in proportion to each target.
  const links: FlowLink[] = [];
  const total = Math.max(inMinor, spentMinor);
  const sources = nodes.filter((n) => n.column === 0);
  const targets = nodes.filter((n) => n.column === 1);
  if (total > 0)
    for (const s of sources)
      for (const t of targets)
        links.push({
          source: s.id,
          target: t.id,
          valueMinor: Math.round((s.valueMinor * t.valueMinor) / total),
        });

  const expand =
    input.expand && byCat.has(input.expand) && shown.some(([id]) => id === input.expand)
      ? input.expand
      : null;
  if (expand) {
    const byMerchant = new Map<string, { label: string; value: number }>();
    for (const t of spending) {
      if (t.categoryId !== expand) continue;
      const key = normalizeMerchantKey(t.merchant) || 'untitled';
      const m = byMerchant.get(key) ?? { label: t.merchant || tl('Untitled'), value: 0 };
      m.value += t.amountMinor;
      byMerchant.set(key, m);
    }
    const list = [...byMerchant.entries()].sort((a, b) => b[1].value - a[1].value);
    const top = list.slice(0, MAX_MERCHANTS);
    const others = list.slice(MAX_MERCHANTS).reduce((s, [, m]) => s + m.value, 0);
    for (const [key, m] of top) {
      nodes.push({
        id: `m:${key}`,
        label: m.label,
        valueMinor: m.value,
        column: 2,
        kind: 'merchant',
      });
      links.push({ source: `cat:${expand}`, target: `m:${key}`, valueMinor: m.value });
    }
    if (others > 0) {
      nodes.push({
        id: 'm:others',
        label: tl('Others'),
        valueMinor: others,
        column: 2,
        kind: 'merchant',
      });
      links.push({ source: `cat:${expand}`, target: 'm:others', valueMinor: others });
    }
  }
  return { nodes, links, inMinor, spentMinor };
}
