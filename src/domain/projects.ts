import { diffDays } from './dates';
import type { CategoryId, ISODate, Transaction } from './types';

/**
 * Trips, projects and festival funds (Drop 12): a bucket of entries with its own budget and total.
 * Entries join from the form, from bulk actions or, while one with dates is on and set to collect them,
 * automatically by date.
 */

export type ProjectKind = 'trip' | 'project' | 'festival';

export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = {
  trip: 'Trip',
  project: 'Project',
  festival: 'Festival',
};

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  start?: ISODate;
  end?: ISODate;
  budgetMinor?: number;
  /** New entries dated between start and end join it by themselves. */
  collect: boolean;
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export const MAX_PROJECT_NAME = 40;

export function projectProblem(
  draft: Pick<Project, 'name' | 'start' | 'end' | 'budgetMinor' | 'collect'>,
  others: readonly Pick<Project, 'id' | 'name'>[],
  ignoreId?: string,
): string | null {
  const n = draft.name.trim();
  if (!n) return 'Give it a name';
  if (n.length > MAX_PROJECT_NAME) return `Keep the name under ${MAX_PROJECT_NAME} characters`;
  if (others.some((p) => p.id !== ignoreId && p.name.toLowerCase() === n.toLowerCase()))
    return 'There is already one with that name';
  if (draft.start && draft.end && draft.end < draft.start)
    return 'The last day is before the first';
  if (draft.collect && !(draft.start && draft.end))
    return 'To collect entries by date, give the first and last day';
  if (draft.budgetMinor !== undefined && draft.budgetMinor < 0)
    return 'The budget cannot be negative';
  return null;
}

/** The project a new entry on `date` joins by itself: one collecting by date; the latest-starting wins. */
export function projectForDate(projects: readonly Project[], date: ISODate): Project | null {
  let best: Project | null = null;
  for (const p of projects) {
    if (p.archived || !p.collect || !p.start || !p.end) continue;
    if (date < p.start || date > p.end) continue;
    if (!best || p.start > best.start!) best = p;
  }
  return best;
}

export type ProjectStatus = 'upcoming' | 'on' | 'done' | 'open';

export interface ProjectSummary {
  spentMinor: number;
  count: number;
  /** Budget less spending (negative when over); null without a budget. */
  leftMinor: number | null;
  /** Days from the first day to the last (or to today while it is on); null without dates. */
  days: number | null;
  perDayMinor: number | null;
  byCategory: Array<{ categoryId: CategoryId; totalMinor: number }>;
  status: ProjectStatus;
  entries: Transaction[];
}

export function projectSummary(
  project: Project,
  transactions: readonly Transaction[],
  today: ISODate,
): ProjectSummary {
  const entries = transactions
    .filter((t) => t.projectId === project.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const spentMinor = entries.reduce((s, t) => s + t.amountMinor, 0);
  const byCat = new Map<CategoryId, number>();
  for (const t of entries) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountMinor);
  const status: ProjectStatus =
    !project.start || !project.end
      ? 'open'
      : today < project.start
        ? 'upcoming'
        : today > project.end
          ? 'done'
          : 'on';
  let days: number | null = null;
  if (project.start && project.end && status !== 'upcoming') {
    const last = status === 'on' ? today : project.end;
    days = diffDays(last, project.start) + 1;
  }
  return {
    spentMinor,
    count: entries.length,
    leftMinor: project.budgetMinor === undefined ? null : project.budgetMinor - spentMinor,
    days,
    perDayMinor: days && days > 0 ? Math.round(spentMinor / days) : null,
    byCategory: [...byCat.entries()]
      .map(([categoryId, totalMinor]) => ({ categoryId, totalMinor }))
      .sort((a, b) => b.totalMinor - a.totalMinor),
    status,
    entries,
  };
}
