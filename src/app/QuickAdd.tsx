import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLedger } from '../data/store';
import { addDays, fmtDate, monthKey, monthLabel, todayISO } from '../domain/dates';
import { fmtMoney } from '../domain/money';
import { parseQuickEntry } from '../domain/parser';
import { usePrivacy } from './Money';

function dateLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return fmtDate(date);
}

export function QuickAdd({ autoFocus = false }: { autoFocus?: boolean }) {
  const categories = useLedger((s) => s.categories);
  const rules = useLedger((s) => s.rules);
  const lastMethod = useLedger((s) => s.settings.lastMethod);
  const currency = useLedger((s) => s.settings.currency);
  const addFromParsed = useLedger((s) => s.addFromParsed);
  usePrivacy(); // re-render the amount chip when privacy changes

  const [text, setText] = useState('');
  const [override, setOverride] = useState<string | undefined>(undefined);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const today = todayISO();
  const parsed = useMemo(
    () => (text.trim() ? parseQuickEntry(text, { today, lastMethod, rules }) : null),
    [text, today, lastMethod, rules],
  );

  const errors = parsed ? [...parsed.errors] : [];
  if (parsed && attempted && parsed.amountMinor === null) errors.push('Add an amount to save');

  const clear = () => {
    setText('');
    setOverride(undefined);
    setAttempted(false);
  };

  const save = async () => {
    if (!parsed || saving) return;
    setAttempted(true);
    if (!parsed.ok) return;
    setSaving(true);
    try {
      await addFromParsed(parsed, override);
      clear();
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clear();
    }
  };

  const categoryValue = override ?? (parsed?.unsure ? '' : (parsed?.categoryId ?? ''));
  const showUnsure = parsed?.unsure === true && override === undefined;
  const color = categories.find((c) => c.id === (override ?? parsed?.categoryId))?.color;

  return (
    <section className="card quick-add">
      <h2>
        <label htmlFor="quick-add-input">Quick add</label>
      </h2>
      <input
        ref={input}
        id="quick-add-input"
        className="input"
        type="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        placeholder="shawarma 500 on 18th upi"
        aria-describedby="quick-add-help"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setAttempted(false);
        }}
        onKeyDown={onKeyDown}
      />
      {!parsed && (
        <p id="quick-add-help" className="muted small">
          Type what, how much and when. Press Enter to save, Escape to clear.
        </p>
      )}
      {parsed && (
        <ul className="chips" aria-label="What Ledger understood" id="quick-add-help">
          <li className="chip" data-testid="chip-amount">
            {parsed.amountMinor !== null ? (
              <span className="amt">{fmtMoney(parsed.amountMinor, { currency })}</span>
            ) : (
              <span className="muted">No amount yet</span>
            )}
          </li>
          <li className="chip" data-testid="chip-date">
            {dateLabel(parsed.date, today)}
            {parsed.upcoming && <span className="chip-note">Upcoming</span>}
          </li>
          {monthKey(parsed.date) !== monthKey(today) && (
            <li className="chip chip-note" data-testid="chip-month">
              Saves to {monthLabel(monthKey(parsed.date))}
            </li>
          )}
          <li className="chip" data-testid="chip-category">
            {color && !showUnsure && <span className="dot" style={{ background: color }} />}
            <label className="visually-hidden" htmlFor="quick-add-category">
              Category
            </label>
            <select
              id="quick-add-category"
              className="select"
              value={categoryValue}
              onChange={(e) => setOverride(e.target.value || undefined)}
            >
              {showUnsure && <option value="">Pick a category</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </li>
          <li className="chip" data-testid="chip-method">
            {parsed.method}
          </li>
        </ul>
      )}
      {showUnsure && (
        <p className="muted small">
          Not sure where this goes. Pick a category and Ledger will remember it.
        </p>
      )}
      {errors.length > 0 && (
        <ul className="errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
