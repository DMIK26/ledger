import { tl } from './i18n';
/**
 * The Dashboard's movable cards (Drop 11). Quick add stays first and the time-limited cards (check-in,
 * close the month, recap) stay on top; these can be reordered and hidden.
 */

export const DASHBOARD_CARDS = [
  'month',
  'risk',
  'cards',
  'nudges',
  'insights',
  'day',
  'charts',
  'sketchbook',
  'recent',
] as const;

export type DashboardCard = (typeof DASHBOARD_CARDS)[number];

export const DASHBOARD_CARD_LABEL: Record<DashboardCard, string> = {
  get month() {
    return tl('This month');
  },
  get risk() {
    return tl('Budgets to watch');
  },
  get cards() {
    return tl('Cards due');
  },
  get nudges() {
    return tl('Worth a look');
  },
  get insights() {
    return tl('Worth knowing');
  },
  get day() {
    return tl('Day by day');
  },
  get charts() {
    return tl('Where it went and last six months');
  },
  get sketchbook() {
    return tl('Sketchbook');
  },
  get recent() {
    return tl('Recent entries');
  },
};

const isCard = (id: string): id is DashboardCard =>
  (DASHBOARD_CARDS as readonly string[]).includes(id);

/** Safe to spend, the four figures and the budget were three cards until they became one (Drop 14). */
const MERGED_INTO_MONTH = ['safe', 'kpis', 'budget'];
const upgrade = (saved: readonly string[]): string[] =>
  saved.map((id) => (MERGED_INTO_MONTH.includes(id) ? 'month' : id));

/** The saved order with unknown ids dropped and any card it does not mention added in its default place. */
export function dashboardOrder(saved: readonly string[]): DashboardCard[] {
  const known = upgrade(saved).filter(isCard);
  const out = [...new Set(known)];
  DASHBOARD_CARDS.forEach((id, i) => {
    if (out.includes(id)) return;
    // Put a new card after the card that comes before it by default.
    const prev = DASHBOARD_CARDS.slice(0, i)
      .reverse()
      .find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, id);
  });
  return out;
}

/** Moves a card up (-1) or down (+1); the ends stay put. */
export function moveCard(
  order: readonly DashboardCard[],
  id: DashboardCard,
  delta: -1 | 1,
): DashboardCard[] {
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return [...order];
  const out = [...order];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** The hidden cards; the month card counts as hidden only if all three cards it replaced were. */
export function dashboardHidden(saved: readonly string[]): DashboardCard[] {
  const out = saved.filter(isCard);
  if (MERGED_INTO_MONTH.every((id) => saved.includes(id)) && !out.includes('month'))
    out.push('month');
  return out;
}
