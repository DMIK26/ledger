import { useMemo } from 'react';
import { useLedger } from '../data/store';
import { dayShort, monthShort, parseISO, todayISO, weekdayOf } from '../domain/dates';
import { habitSummary, loggedDays, missedDays, type HabitSummary } from '../domain/habit';
import { navigate, type RoutePath } from './router';
import { tl } from '../domain/i18n';

/** "Tue 20 Oct": short enough for a phone row. */
export function shortDay(iso: string): string {
  const p = parseISO(iso)!;
  return `${dayShort(weekdayOf(iso))} ${p.d} ${monthShort(p.m)}`;
}

const days = (n: number) => (n === 1 ? tl('1 day') : tl('{0} days', n));

/** Plain words for the habit line. Kind on purpose: no guilt, no exclamation marks. */
export function habitText(h: HabitSummary): string {
  const parts = [tl('Logged {0} of the last {1}.', h.loggedInWindow, days(h.windowDays))];
  if (h.run >= 2) {
    const rest =
      h.restUsed > 0
        ? tl(', with {0}', h.restUsed === 1 ? tl('a rest day') : tl('{0} rest days', h.restUsed))
        : '';
    parts.push(tl('{0} in a row{1}.', days(h.run), rest));
  }
  if (h.restSaved > 0)
    parts.push(
      tl(
        '{0} saved for a day off.',
        h.restSaved === 1 ? tl('A rest day') : tl('{0} rest days', h.restSaved),
      ),
    );
  return parts.join(' ');
}

function useHabit() {
  const transactions = useLedger((s) => s.transactions);
  const noSpend = useLedger((s) => s.noSpendDays);
  const today = todayISO();
  return useMemo(() => {
    const logged = loggedDays(transactions, noSpend);
    return { today, missed: missedDays(logged, today), habit: habitSummary(logged, today) };
  }, [transactions, noSpend, today]);
}

/**
 * The missed-day check-in: asks about days this week with nothing logged ("No spend, or forgot?"),
 * then gets out of the way. Below it, or alone when nothing is missed, the logging habit in one line.
 */
export function CheckIn({ path = '/' }: { path?: RoutePath }) {
  const hiddenOn = useLedger((s) => s.settings.checkinHiddenOn);
  const markNoSpend = useLedger((s) => s.markNoSpend);
  const setSetting = useLedger((s) => s.setSetting);
  const { today, missed, habit } = useHabit();
  const showHabit = habit !== null && habit.windowDays >= 3;

  if (missed.length === 0 || hiddenOn === today) {
    return showHabit ? (
      <p className="habit-line muted small" data-testid="habit-line">
        {habitText(habit)}
      </p>
    ) : null;
  }

  const title =
    missed.length === 1
      ? tl('Nothing logged on {0}', shortDay(missed[0]!))
      : tl('Nothing logged on {0} days this week', missed.length);
  return (
    <section className="card checkin" aria-labelledby="checkin-title" data-testid="checkin">
      <h2 id="checkin-title">{title}</h2>
      <p className="muted">{tl('No spend, or forgot? Either is fine.')}</p>
      <ul className="checkin-days">
        {missed.map((d) => (
          <li key={d}>
            <span className="checkin-day">{shortDay(d)}</span>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={tl('No spend on {0}', shortDay(d))}
              onClick={() => void markNoSpend([d])}
            >
              {tl('No spend')}
            </button>
            <button
              type="button"
              className="btn"
              aria-label={tl('Add an entry for {0}', shortDay(d))}
              onClick={() => navigate(`${path}?action=add&on=${d}`)}
            >
              {tl('Add')}
            </button>
          </li>
        ))}
      </ul>
      <div className="btn-row">
        {missed.length > 1 && (
          <button type="button" className="btn" onClick={() => void markNoSpend(missed)}>
            {tl('All no spend')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void setSetting('checkinHiddenOn', today)}
        >
          {tl('Not now')}
        </button>
      </div>
      {showHabit && <p className="habit-line muted small">{habitText(habit)}</p>}
    </section>
  );
}
