/**
 * The Dashboard's movable cards (Drop 11). Quick add stays first and the time-limited cards (check-in,
 * close the month, recap) stay on top; these can be reordered and hidden.
 */

export const DASHBOARD_CARDS = [
  'safe',
  'kpis',
  'budget',
  'risk',
  'cards',
  'insights',
  'day',
  'charts',
  'sketchbook',
  'recent',
] as const;

export type DashboardCard = (typeof DASHBOARD_CARDS)[number];

export const DASHBOARD_CARD_LABEL: Record<DashboardCard, string> = {
  safe: 'Safe to spend today',
  kpis: 'This month at a glance',
  budget: 'Budget',
  risk: 'Budgets to watch',
  cards: 'Cards due',
  insights: 'Worth knowing',
  day: 'Day by day',
  charts: 'Where it went and last six months',
  sketchbook: 'Sketchbook',
  recent: 'Recent entries',
};

const isCard = (id: string): id is DashboardCard =>
  (DASHBOARD_CARDS as readonly string[]).includes(id);

/** The saved order with unknown ids dropped and any card it does not mention added in its default place. */
export function dashboardOrder(saved: readonly string[]): DashboardCard[] {
  const known = saved.filter(isCard);
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
