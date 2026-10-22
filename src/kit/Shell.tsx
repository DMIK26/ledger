import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../app/icons';
import { Money, usePrivacy } from '../app/Money';
import { useLedger } from '../data/store';
import { lastMonths, monthSeries } from '../domain/aggregates';
import { budgetsForMonth, budgetStatus } from '../domain/budgets';
import { fmtDate, monthKey, monthLabel, monthRangeLabel, shiftMonthKey, todayISO } from '../domain/dates';
import { fmtMoney } from '../domain/money';
import { navSummary } from '../domain/navSummary';
import { PIN_KIND_LABEL } from '../domain/pins';
import { useRoving } from './roving';
import { useScopedTransactions, useView, useViewMonth } from './view';

/** Closes a popover on Escape or a click outside it. */
function useDismiss(open: boolean, close: () => void, root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, close, root]);
}

const shift = shiftMonthKey;

/**
 * The month switcher: previous and next, and a popover of the last twelve months with a mini bar of
 * spending and a mood dot for the budget (under, close, over).
 */
export function MonthSwitcher() {
  const month = useViewMonth();
  const setMonth = useView((s) => s.setMonth);
  const announce = useView((s) => s.announce);
  const transactions = useScopedTransactions();
  const budgets = useLedger((s) => s.budgets);
  const currency = useLedger((s) => s.settings.currency);
  usePrivacy();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const thisMonth = monthKey(today);
  const months = useMemo(() => lastMonths(today, 12), [today]);
  const series = useMemo(() => monthSeries(transactions, months), [transactions, months]);
  const max = Math.max(1, ...series.map((p) => p.totalMinor));
  const roving = useRoving(months.length);
  useDismiss(open, () => setOpen(false), root);

  const go = (m: string) => {
    setMonth(m);
    setOpen(false);
    announce(`Showing ${monthLabel(m)}.`);
  };

  return (
    <div className="month-switcher" ref={root}>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label="Previous month"
        disabled={month <= months[0]!}
        onClick={() => go(shift(month, -1))}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        type="button"
        className="btn month-button"
        aria-haspopup="true"
        aria-expanded={open}
        data-testid="month-switcher"
        onClick={() => setOpen((o) => !o)}
      >
        {monthLabel(month)}
        {monthRangeLabel(month) && (
          <span className="month-range">{monthRangeLabel(month)}</span>
        )}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label="Next month"
        disabled={month >= thisMonth}
        onClick={() => go(shift(month, 1))}
      >
        <span aria-hidden="true">›</span>
      </button>
      {open && (
        <div className="popover month-pop" role="group" aria-label="Choose a month">
          <ul className="month-list" data-roving-group="">
            {series.map((p, i) => {
              const b = budgetsForMonth(budgets, p.month).overall;
              const mood = b === null ? 'none' : budgetStatus(p.totalMinor, b).kind;
              const moodText = {
                none: 'no budget',
                under: 'within budget',
                near: 'close to budget',
                over: 'over budget',
              }[mood];
              const rv = roving.props(i);
              return (
                <li key={p.month}>
                  <button
                    type="button"
                    className="month-item"
                    aria-current={p.month === month ? 'true' : undefined}
                    aria-label={`${monthLabel(p.month)}${monthRangeLabel(p.month) ? ` (${monthRangeLabel(p.month)})` : ''}, ${fmtMoney(p.totalMinor, { currency })}, ${moodText}`}
                    {...rv}
                    onClick={() => go(p.month)}
                  >
                    <span className="month-name">{monthLabel(p.month).slice(0, 3)}</span>
                    <span className="mini-bar" aria-hidden="true">
                      <span style={{ width: `${(p.totalMinor / max) * 100}%` }} />
                    </span>
                    <span className={`mood mood-${mood}`} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          {month !== thisMonth && (
            <button type="button" className="btn btn-ghost" onClick={() => go(thisMonth)}>
              Back to this month
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The pins currently filtering every page, under the top bar. Esc removes the last one. */
export function PinBar() {
  const pins = useView((s) => s.pins);
  const removePin = useView((s) => s.removePin);
  const clearPins = useView((s) => s.clearPins);
  const shown = useScopedTransactions();
  const currency = useLedger((s) => s.settings.currency);
  if (pins.length === 0) return null;
  const total = shown.reduce((s, t) => s + t.amountMinor, 0);
  return (
    <div className="pin-bar" role="region" aria-label="Pinned" data-testid="pin-bar">
      <span className="small muted">Showing only</span>
      <ul className="chips">
        {pins.map((p) => (
          <li key={`${p.kind}:${p.id}`}>
            <button
              type="button"
              className="chip pin-chip"
              aria-label={`Unpin ${PIN_KIND_LABEL[p.kind].toLowerCase()} ${p.label}`}
              onClick={() => removePin(p)}
            >
              {p.label}
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <span className="small muted pin-total">
        {shown.length === 1 ? '1 entry' : `${shown.length} entries`},{' '}
        <Money minor={total} currency={currency} />
      </span>
      <button type="button" className="btn btn-ghost" onClick={clearPins}>
        Clear
      </button>
    </div>
  );
}

/** Polite announcements (pins, month changes) for screen readers. */
export function LiveRegion() {
  const text = useView((s) => s.announcement);
  return (
    <div className="visually-hidden" role="status" aria-live="polite" data-testid="live">
      {text}
    </div>
  );
}

/** Undo, Redo, and a history of the last changes as chips: pick one to undo back to before it. */
export function UndoControls() {
  const canUndo = useLedger((s) => s.canUndo);
  const canRedo = useLedger((s) => s.canRedo);
  const undoLabel = useLedger((s) => s.undoLabel);
  const redoLabel = useLedger((s) => s.redoLabel);
  const history = useLedger((s) => s.history);
  const undo = useLedger((s) => s.undo);
  const redo = useLedger((s) => s.redo);
  const undoMany = useLedger((s) => s.undoMany);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), root);
  if (!canUndo && !canRedo) return null;
  return (
    <div className="undo-controls" ref={root}>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={!canUndo}
        onClick={() => void undo()}
        title={undoLabel ? `Undo: ${undoLabel}` : 'Undo'}
      >
        <Icon name="undo" />
        <span className="undo-text">Undo</span>
      </button>
      {canRedo && (
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={redoLabel ? `Redo: ${redoLabel}` : 'Redo'}
          title={redoLabel ? `Redo: ${redoLabel}` : 'Redo'}
          onClick={() => void redo()}
        >
          <Icon name="redo" />
        </button>
      )}
      {history.length > 1 && (
        <button
          type="button"
          className="btn btn-ghost history-button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="history-icon" aria-hidden="true">
            <Icon name="history" />
          </span>
          <span className="history-text">History</span>
        </button>
      )}
      {open && (
        <div className="popover history-pop" role="group" aria-label="Recent changes">
          <p className="small muted">Undo back to before:</p>
          <ul className="chips history-chips">
            {history.map((label, i) => (
              <li key={`${i}-${label}`}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    setOpen(false);
                    void undoMany(i + 1);
                  }}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Numbers for the nav badges and the peek card text for each section. */
export function useNavInfo() {
  const transactions = useScopedTransactions();
  const budgets = useLedger((s) => s.budgets);
  const recurring = useLedger((s) => s.recurring);
  const lastBackupAt = useLedger((s) => s.settings.lastBackupAt);
  const currency = useLedger((s) => s.settings.currency);
  usePrivacy();
  const today = todayISO();
  const s = useMemo(
    () => navSummary(transactions, budgets, recurring, today),
    [transactions, budgets, recurring, today],
  );
  const money = (m: number) => fmtMoney(m, { currency });
  const label = monthLabel(monthKey(today));
  return {
    badges: {
      '/transactions': s.unsure > 0 ? { count: s.unsure, text: `${s.unsure} unsure` } : null,
      '/budgets':
        s.overCategories > 0
          ? { count: s.overCategories, text: `${s.overCategories} over budget` }
          : null,
      '/recurring': s.dueSoon > 0 ? { count: s.dueSoon, text: `${s.dueSoon} due this week` } : null,
    } as Record<string, { count: number; text: string } | null>,
    peeks: {
      '/': `${money(s.monthMinor)} spent in ${label} so far`,
      '/transactions': `${s.entries === 1 ? '1 entry' : `${s.entries} entries`} in ${label}${
        s.unsure > 0 ? `, ${s.unsure} with a guessed category` : ''
      }`,
      '/budgets':
        s.budgetLeftMinor === null
          ? `No budget for ${label}`
          : s.budgetLeftMinor >= 0
            ? `${money(s.budgetLeftMinor)} left of this month's budget`
            : `Over this month's budget by ${money(-s.budgetLeftMinor)}`,
      '/reports': `${label} so far: ${money(s.monthMinor)}`,
      '/recurring': s.next
        ? `Next: ${s.next.merchant}, ${money(s.next.amountMinor)} on ${fmtDate(s.next.date)}`
        : 'Nothing due in the next week',
      '/settings':
        lastBackupAt > 0
          ? `Last backup ${fmtDate(todayISO(new Date(lastBackupAt)))}`
          : 'No backup yet',
    } as Record<string, string>,
  };
}
