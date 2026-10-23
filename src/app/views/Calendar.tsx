import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLedger } from '../../data/store';
import { calendarWeeks, type CalendarDay } from '../../domain/calendar';
import {
  addDays,
  dayShort,
  fmtDate,
  monthBounds,
  monthKey,
  monthLabel,
  shiftMonthKey,
  todayISO,
} from '../../domain/dates';
import { fmtMoney } from '../../domain/money';
import { useView, useViewMonth } from '../../kit/view';
import { Icon } from '../icons';
import { Money, usePrivacy } from '../Money';
import { addPath, navigate } from '../router';
import { TxList } from '../TxList';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

/** Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** What a day holds, in words, for its button's accessible name. */
function dayLabel(d: CalendarDay, currency: string): string {
  const parts = [fmtDate(d.date)];
  parts.push(
    d.entries > 0
      ? tl('{0} spent', fmtMoney(d.spentMinor, { currency }))
      : d.noSpend
        ? tl('no spend')
        : tl('nothing logged'),
  );
  if (d.bills.length)
    parts.push(d.bills.length === 1 ? tl('1 bill due') : tl('{0} bills due', d.bills.length));
  if (d.income.length) parts.push(tl('money in'));
  if (d.cardsDue.length) parts.push(tl('card due'));
  return parts.join(', ');
}

/**
 * Transactions > Calendar (Drop 11): the month in weeks, Monday first. Arrow keys move a day or a week,
 * Page Up and Page Down change the month; choosing a day shows everything on it below.
 */
export function CalendarView() {
  const transactions = useLedger((s) => s.transactions);
  const flows = useLedger((s) => s.flows);
  const recurring = useLedger((s) => s.recurring);
  const accounts = useLedger((s) => s.accounts);
  const noSpendDays = useLedger((s) => s.noSpendDays);
  const currency = useLedger((s) => s.settings.currency);
  const removeTransaction = useLedger((s) => s.removeTransaction);
  usePrivacy();
  const month = useViewMonth();
  const setMonth = useView((s) => s.setMonth);
  const today = todayISO();
  const { start, end } = monthBounds(month);
  const [picked, setPicked] = useState<string>(() =>
    today >= start && today <= end ? today : start,
  );
  const selected = picked >= start && picked <= end ? picked : start;
  const grid = useRef<HTMLDivElement>(null);
  const weeks = useMemo(
    () => calendarWeeks(month, { transactions, flows, recurring, accounts, noSpendDays, today }),
    [month, transactions, flows, recurring, accounts, noSpendDays, today],
  );
  const days = weeks.flat();
  const day = days.find((d) => d.date === selected)!;
  const entries = useMemo(
    () => transactions.filter((t) => t.date === selected),
    [transactions, selected],
  );
  const monthTotal = days.filter((d) => d.inMonth).reduce((s, d) => s + d.spentMinor, 0);

  const focusDay = (date: string) => {
    setPicked(date);
    const key = monthKey(date);
    if (key !== month) setMonth(key);
    const focus = () =>
      grid.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus();
    // The day is usually on screen already; in another month it appears after the next render.
    if (grid.current?.querySelector(`[data-date="${date}"]`)) focus();
    else setTimeout(focus, 0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (moves[e.key] !== undefined) {
      e.preventDefault();
      focusDay(addDays(date, moves[e.key]!));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const next = shiftMonthKey(month, e.key === 'PageUp' ? -1 : 1);
      focusDay(monthBounds(next).start);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const week = weeks.find((w) => w.some((d) => d.date === date))!;
      focusDay((e.key === 'Home' ? week[0] : week[6])!.date);
    }
  };

  return (
    <>
      <section className="card calendar-card" aria-labelledby="cal-title">
        <div className="calendar-head">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setMonth(shiftMonthKey(month, -1))}
          >
            {tl('Previous')}
          </button>
          <div>
            <h2 id="cal-title">{monthLabel(month)}</h2>
            <p className="muted small">
              {tr('{0} spent', <Money minor={monthTotal} currency={currency} />)}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setMonth(shiftMonthKey(month, 1))}
          >
            {tl('Next')}
          </button>
        </div>
        <div className="calendar" role="grid" aria-labelledby="cal-title" ref={grid}>
          <div className="cal-row" role="row">
            {WEEK.map((d) => (
              <span key={d} role="columnheader" className="cal-weekday">
                {dayShort(d)}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]!.date} className="cal-row" role="row">
              {week.map((d) => (
                <div key={d.date} role="gridcell" aria-selected={d.date === selected}>
                  <button
                    type="button"
                    data-date={d.date}
                    data-testid={`cal-${d.date}`}
                    className={[
                      'cal-day',
                      d.inMonth ? '' : 'cal-out',
                      d.isToday ? 'cal-today' : '',
                      d.date === selected ? 'cal-selected' : '',
                    ].join(' ')}
                    tabIndex={d.date === selected ? 0 : -1}
                    aria-label={dayLabel(d, currency)}
                    onClick={() => setPicked(d.date)}
                    onKeyDown={(e) => onKeyDown(e, d.date)}
                  >
                    <span className="cal-num">{d.day}</span>
                    {d.entries > 0 && (
                      <Money
                        className="cal-amount"
                        minor={d.spentMinor}
                        currency={currency}
                        compact
                      />
                    )}
                    <span className="cal-marks" aria-hidden="true">
                      {d.bills.length > 0 && <span className="cal-mark cal-bill" />}
                      {d.income.length > 0 && <span className="cal-mark cal-in" />}
                      {d.cardsDue.length > 0 && <span className="cal-mark cal-card" />}
                      {d.noSpend && <span className="cal-mark cal-rest" />}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="muted small cal-key">
          {tr(
            '{0} Bill due{1} Money in{2} Card due{3} No spend',
            <span className="cal-mark cal-bill" aria-hidden="true" />,
            <span className="cal-mark cal-in" aria-hidden="true" />,
            <span className="cal-mark cal-card" aria-hidden="true" />,
            <span className="cal-mark cal-rest" aria-hidden="true" />,
          )}
        </p>
      </section>

      <section className="card" aria-labelledby="cal-day-title" data-testid="cal-day">
        <div className="card-head">
          <h2 id="cal-day-title">{fmtDate(selected)}</h2>
          <button type="button" className="btn" onClick={() => navigate(addPath(selected))}>
            <Icon name="plus" />
            {tl('Add for this day')}
          </button>
        </div>
        {entries.length > 0 ? (
          <TxList
            label={tl('Entries on {0}', fmtDate(selected))}
            transactions={entries}
            onDelete={(id) => void removeTransaction(id)}
          />
        ) : (
          <p className="muted small">
            {day.noSpend
              ? tl('Marked as a day with no spending.')
              : tl('Nothing logged on this day.')}
          </p>
        )}
        {(day.bills.length > 0 || day.income.length > 0 || day.cardsDue.length > 0) && (
          <ul className="money-list">
            {day.bills.map((b) => (
              <li key={`b-${b.id}`} className="money-row">
                <span className="money-main">
                  <span>{b.merchant}</span>
                  <span className="muted small">{tl('Bill due')}</span>
                </span>
                <Money minor={b.amountMinor} currency={currency} />
                <span />
              </li>
            ))}
            {day.income.map((f) => (
              <li key={`i-${f.id}`} className="money-row">
                <span className="money-main">
                  <span>{f.label}</span>
                  <span className="muted small">{tl('Money in')}</span>
                </span>
                <Money minor={f.amountMinor} currency={currency} />
                <span />
              </li>
            ))}
            {day.cardsDue.map((c) => (
              <li key={`c-${c.id}`} className="money-row">
                <span className="money-main">
                  <span>{c.name}</span>
                  <span className="muted small">{tl('Card payment due')}</span>
                </span>
                <span />
                <span />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
