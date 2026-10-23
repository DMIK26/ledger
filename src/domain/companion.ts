import { categoryTotals, inMonth, kpis } from './aggregates';
import { budgetStatus, projectMonthEnd } from './budgets';
import { categoryById } from './categories';
import { fmtDate, monthBounds, monthKey, monthProgress } from './dates';
import type { Insight } from './insights';
import { fmtMoney } from './money';
import { nextOccurrence, type RecurringItem } from './recurring';
import type { Category, ISODate, Transaction } from './types';
import { tl } from './i18n';

/** The pencil's mood: from the month's budget, or asleep when nobody has touched anything for a while. */
export type Mood = 'relaxed' | 'worried' | 'dizzy' | 'asleep';

export const IDLE_MS = 60_000;

export function companionMood(spentMinor: number, budgetMinor: number | null, idle: boolean): Mood {
  if (idle) return 'asleep';
  if (budgetMinor === null || budgetMinor <= 0) return 'relaxed';
  const ratio = spentMinor / budgetMinor;
  if (ratio > 1) return 'dizzy';
  if (ratio >= 0.8) return 'worried';
  return 'relaxed';
}

export const MOOD_LABEL: Record<Mood, string> = {
  relaxed: 'relaxed',
  get worried() {
    return tl('a little worried');
  },
  dizzy: 'dizzy',
  asleep: 'asleep',
};

/** What the pencil holds on each page. */
export type Prop = 'cup' | 'magnifier' | 'coin' | 'ruler' | 'calendar' | 'wrench';

export const PAGE_PROP: Record<string, Prop> = {
  '/': 'cup',
  '/transactions': 'magnifier',
  '/budgets': 'coin',
  '/reports': 'ruler',
  '/recurring': 'calendar',
  '/settings': 'wrench',
};

export type Question = 'where' | 'biggest' | 'budget' | 'busiest' | 'trend' | 'next';

export const QUESTION_LABEL: Record<Question, string> = {
  get where() {
    return tl('Where did most of it go?');
  },
  get biggest() {
    return tl('What was the biggest one?');
  },
  get budget() {
    return tl('Am I on budget?');
  },
  get busiest() {
    return tl('Which day was busiest?');
  },
  get trend() {
    return tl('How does this month compare?');
  },
  get next() {
    return tl('What is due next?');
  },
};

/** The questions that make sense on each page, most useful first. */
export const PAGE_QUESTIONS: Record<string, Question[]> = {
  '/': ['where', 'budget', 'biggest', 'trend'],
  '/transactions': ['biggest', 'busiest', 'where'],
  '/budgets': ['budget', 'where'],
  '/reports': ['busiest', 'where', 'trend'],
  '/recurring': ['next', 'biggest'],
  '/settings': ['budget', 'next'],
};

export interface AskContext {
  /** Entries already narrowed by the pins. */
  transactions: readonly Transaction[];
  categories: readonly Category[];
  recurring: readonly RecurringItem[];
  overallBudgetMinor: number | null;
  /** The month on screen ('YYYY-MM'). */
  month: string;
  today: ISODate;
  currency: string;
}

/** An answer: a short caption and the thing on the page it points at (a data-anchor), if any. */
export interface Answer {
  text: string;
  anchor: string | null;
}

/** The month's entries up to today (a past month is shown whole). */
function monthEntries(ctx: AskContext): Transaction[] {
  return inMonth(ctx.transactions, ctx.month).filter((t) => t.date <= ctx.today);
}

export function answer(q: Question, ctx: AskContext): Answer {
  const money = (m: number) => fmtMoney(m, { currency: ctx.currency });
  const list = monthEntries(ctx);
  const name = (id: string) => categoryById(ctx.categories, id)?.name ?? tl('Other');
  switch (q) {
    case 'where': {
      const top = categoryTotals(list, ctx.month)[0];
      if (!top) return { text: tl('Nothing spent this month yet, so nowhere.'), anchor: null };
      return {
        text: tl('Most of it went on {0}: {1}.', name(top.categoryId), money(top.totalMinor)),
        anchor: `category:${top.categoryId}`,
      };
    }
    case 'biggest': {
      const big = [...list].sort((a, b) => b.amountMinor - a.amountMinor)[0];
      if (!big) return { text: tl('No entries this month yet.'), anchor: null };
      return {
        text: tl('{0}, {1} on {2}.', big.merchant, money(big.amountMinor), fmtDate(big.date)),
        anchor: `tx:${big.id}`,
      };
    }
    case 'budget': {
      if (ctx.overallBudgetMinor === null)
        return {
          text: tl('There is no budget for this month yet. Set one on Budgets.'),
          anchor: null,
        };
      const spent = list.reduce((s, t) => s + t.amountMinor, 0);
      const now = budgetStatus(spent, ctx.overallBudgetMinor);
      if (now.kind === 'over')
        return {
          text: tl('Over by {0} already. Slower days from here.', money(now.overMinor)),
          anchor: 'budget:overall',
        };
      const current = monthKey(ctx.today) === ctx.month;
      const p = monthProgress(ctx.today);
      if (current && p.day < p.length) {
        const end = budgetStatus(projectMonthEnd(spent, ctx.today), ctx.overallBudgetMinor);
        return {
          text:
            end.kind === 'over'
              ? tl(
                  '{0} left, but this pace ends {1} over.',
                  money(now.leftMinor),
                  money(end.overMinor),
                )
              : tl('Yes. {0} left and the pace looks fine.', money(now.leftMinor)),
          anchor: 'budget:overall',
        };
      }
      return {
        text: tl('Yes, with {0} to spare.', money(now.leftMinor)),
        anchor: 'budget:overall',
      };
    }
    case 'busiest': {
      const byDay = new Map<string, number>();
      for (const t of list) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amountMinor);
      const top = [...byDay.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      if (!top) return { text: tl('No entries this month yet.'), anchor: null };
      return { text: `${fmtDate(top[0])}: ${money(top[1])}.`, anchor: `day:${top[0]}` };
    }
    case 'trend': {
      const k = kpis(
        ctx.transactions,
        ctx.month === monthKey(ctx.today) ? ctx.today : lastDay(ctx.month),
      );
      const text =
        k.changePct === null
          ? tl('Last month had nothing to compare with.')
          : k.changePct === 0
            ? tl('About the same as last month by this day.')
            : tl(
                '{0}% {1} than last month by this day.',
                Math.abs(k.changePct),
                k.changePct > 0 ? tl('more') : tl('less'),
              );
      return { text, anchor: `month:${ctx.month}` };
    }
    case 'next': {
      const next = ctx.recurring
        .map((r) => ({ r, date: nextOccurrence(r, ctx.today) }))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!next) return { text: tl('Nothing recurring yet.'), anchor: null };
      return {
        text: tl(
          '{0}, {1} on {2}.',
          next.r.merchant,
          money(next.r.amountMinor),
          fmtDate(next.date),
        ),
        anchor: `recurring:${next.r.id}`,
      };
    }
  }
}

const lastDay = (month: string): ISODate => monthBounds(month).end;

/** One auto-annotation per page: an arrow and a short handwritten caption at something worth noticing. */
export function autoAnnotation(
  page: string,
  ctx: AskContext,
  budgetsByCategory: Record<string, number> = {},
): Answer | null {
  const list = monthEntries(ctx);
  const money = (m: number) => fmtMoney(m, { currency: ctx.currency, compact: true });
  switch (page) {
    case '/': {
      const top = categoryTotals(list, ctx.month)[0];
      return top
        ? { text: tl('most of it went here'), anchor: `category:${top.categoryId}` }
        : null;
    }
    case '/transactions': {
      const big = [...list].sort((a, b) => b.amountMinor - a.amountMinor)[0];
      return big
        ? { text: tl('the big one, {0}', money(big.amountMinor)), anchor: `tx:${big.id}` }
        : null;
    }
    case '/budgets': {
      const spentBy = new Map<string, number>();
      for (const t of list)
        spentBy.set(t.categoryId, (spentBy.get(t.categoryId) ?? 0) + t.amountMinor);
      let pick: { id: string; ratio: number } | null = null;
      for (const [id, budget] of Object.entries(budgetsByCategory)) {
        if (budget <= 0) continue;
        const ratio = (spentBy.get(id) ?? 0) / budget;
        if (ratio > 0 && (!pick || ratio > pick.ratio)) pick = { id, ratio };
      }
      if (!pick) return null;
      return {
        text: pick.ratio > 1 ? tl('this one ran over') : tl('closest to its limit'),
        anchor: `budget:${pick.id}`,
      };
    }
    case '/reports': {
      const a = answer('busiest', ctx);
      return a.anchor ? { text: tl('busiest day'), anchor: a.anchor } : null;
    }
    case '/recurring': {
      const a = answer('next', ctx);
      return a.anchor ? { text: tl('next up'), anchor: a.anchor } : null;
    }
    default:
      return null;
  }
}

/** The top insight as one plain sentence, for the pencil's speech bubble. */
export function insightSentence(
  insight: Insight | undefined,
  categories: readonly Category[],
  currency: string,
): string {
  const money = (m: number) => fmtMoney(m, { currency });
  const name = (id: string) => categoryById(categories, id)?.name ?? tl('Other');
  if (!insight) return tl('All quiet. Add an entry and I will keep an eye on it.');
  switch (insight.kind) {
    case 'pace-over':
      return tl('At this pace the month ends {0} over budget.', money(insight.overMinor));
    case 'pace-under':
      return tl('On track: about {0} of the budget should be left.', money(insight.leftMinor));
    case 'category-up':
      return tl('{0} is up {1}% on this point last month.', name(insight.categoryId), insight.pct);
    case 'category-down':
      return tl(
        '{0} is down {1}% on this point last month.',
        name(insight.categoryId),
        insight.pct,
      );
    case 'largest':
      return tl(
        'Biggest this month: {0}, {1}.',
        insight.tx.merchant,
        money(insight.tx.amountMinor),
      );
    case 'upcoming':
      return tl('{0} is due {1}.', insight.merchant, fmtDate(insight.date));
    case 'quiet-days':
      return tl('{0} days this month with nothing spent.', insight.days);
  }
}
