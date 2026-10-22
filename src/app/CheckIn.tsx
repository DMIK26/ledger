import { useMemo } from 'react';
import { useLedger } from '../data/store';
import { MONTHS, parseISO, todayISO, WEEKDAYS, weekdayOf } from '../domain/dates';
import { habitSummary, loggedDays, missedDays, type HabitSummary } from '../domain/habit';
import { navigate, type RoutePath } from './router';

/** "Tue 20 Oct": short enough for a phone row. */
export function shortDay(iso: string): string {
  const p = parseISO(iso)!;
  return `${WEEKDAYS[weekdayOf(iso)]!.slice(0, 3)} ${p.d} ${MONTHS[p.m - 1]!.slice(0, 3)}`;
}

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/** Plain words for the habit line. Kind on purpose: no guilt, no exclamation marks. */
export function habitText(h: HabitSummary): string {
  const parts = [`Logged ${h.loggedInWindow} of the last ${days(h.windowDays)}.`];
  if (h.run >= 2) {
    const rest =
      h.restUsed > 0 ? `, with ${h.restUsed === 1 ? 'a rest day' : `${h.restUsed} rest days`}` : '';
    parts.push(`${days(h.run)} in a row${rest}.`);
  }
  if (h.restSaved > 0)
    parts.push(
      `${h.restSaved === 1 ? 'A rest day' : `${h.restSaved} rest days`} saved for a day off.`,
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
      ? `Nothing logged on ${shortDay(missed[0]!)}`
      : `Nothing logged on ${missed.length} days this week`;
  return (
    <section className="card checkin" aria-labelledby="checkin-title" data-testid="checkin">
      <h2 id="checkin-title">{title}</h2>
      <p className="muted">No spend, or forgot? Either is fine.</p>
      <ul className="checkin-days">
        {missed.map((d) => (
          <li key={d}>
            <span className="checkin-day">{shortDay(d)}</span>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={`No spend on ${shortDay(d)}`}
              onClick={() => void markNoSpend([d])}
            >
              No spend
            </button>
            <button
              type="button"
              className="btn"
              aria-label={`Add an entry for ${shortDay(d)}`}
              onClick={() => navigate(`${path}?action=add&on=${d}`)}
            >
              Add
            </button>
          </li>
        ))}
      </ul>
      <div className="btn-row">
        {missed.length > 1 && (
          <button type="button" className="btn" onClick={() => void markNoSpend(missed)}>
            All no spend
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void setSetting('checkinHiddenOn', today)}
        >
          Not now
        </button>
      </div>
      {showHabit && <p className="habit-line muted small">{habitText(habit)}</p>}
    </section>
  );
}
