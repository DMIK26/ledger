import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLedger } from '../data/store';
import { addDays, fmtDate, monthKey, monthLabel, parseISO, todayISO } from '../domain/dates';
import { findDuplicate } from '../domain/duplicates';
import { highlightSegments } from '../domain/highlight';
import { fmtMoney } from '../domain/money';
import { parseQuickEntry } from '../domain/parser';
import { PAYMENT_METHODS, type PaymentMethod } from '../domain/types';
import { usePrivacy } from './Money';
import { Icon } from './icons';
import { listen, speechSupported } from './voice';
import { useView, useViewMonth } from '../kit/view';

function dateLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return fmtDate(date);
}

/**
 * `followMonth`: on pages that show one month (the Dashboard), saving into another month switches the
 * page to it, so the new entry is on screen.
 */
export function QuickAdd({
  autoFocus = false,
  followMonth = false,
}: {
  autoFocus?: boolean;
  followMonth?: boolean;
}) {
  const categories = useLedger((s) => s.categories);
  const rules = useLedger((s) => s.rules);
  const transactions = useLedger((s) => s.transactions);
  const lastMethod = useLedger((s) => s.settings.lastMethod);
  const currency = useLedger((s) => s.settings.currency);
  const addFromParsed = useLedger((s) => s.addFromParsed);
  const viewMonth = useViewMonth();
  const setMonth = useView((s) => s.setMonth);
  const announce = useView((s) => s.announce);
  usePrivacy(); // re-render the amount chip when privacy changes

  const [text, setText] = useState('');
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [dateOverride, setDateOverride] = useState<string | undefined>(undefined);
  const [methodOverride, setMethodOverride] = useState<PaymentMethod | undefined>(undefined);
  const [attempted, setAttempted] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voice] = useState(speechSupported);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const stopListening = useRef<(() => void) | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const datePicker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const today = todayISO();
  const parsed = useMemo(
    () => (text.trim() ? parseQuickEntry(text, { today, lastMethod, rules }) : null),
    [text, today, lastMethod, rules],
  );
  const segments = useMemo(() => (parsed ? highlightSegments(parsed) : []), [parsed]);

  const date = dateOverride ?? parsed?.date ?? today;
  const method = methodOverride ?? parsed?.method ?? lastMethod;
  // A picked date replaces a typed one, so the typed date's error no longer applies.
  const errors = parsed ? (dateOverride ? [] : [...parsed.errors]) : [];
  if (parsed && attempted && parsed.amountMinor === null) errors.push('Add an amount to save');
  const canSave =
    parsed !== null && parsed.amountMinor !== null && parsed.amountMinor > 0 && errors.length === 0;

  const duplicate =
    parsed && parsed.amountMinor !== null
      ? findDuplicate(
          { date, amountMinor: parsed.amountMinor, merchant: parsed.merchant },
          transactions,
        )
      : null;

  const clear = () => {
    setText('');
    setCategory(undefined);
    setDateOverride(undefined);
    setMethodOverride(undefined);
    setAttempted(false);
    setConfirmDuplicate(false);
  };

  const save = async () => {
    if (!parsed || saving) return;
    setAttempted(true);
    if (!canSave) return;
    if (duplicate && !confirmDuplicate) {
      setConfirmDuplicate(true);
      return;
    }
    setSaving(true);
    try {
      await addFromParsed({ ...parsed, ok: true, errors: [] }, category, {
        date: dateOverride,
        method: methodOverride,
      });
      // Saved into another month: follow it there, so the new entry is on screen.
      const savedMonth = monthKey(dateOverride ?? parsed.date);
      if (followMonth && savedMonth !== viewMonth) {
        setMonth(savedMonth);
        announce(`Saved to ${monthLabel(savedMonth)}. Showing that month.`);
      }
      clear();
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => () => stopListening.current?.(), []);

  const toggleVoice = () => {
    if (listening) {
      stopListening.current?.();
      return;
    }
    setVoiceError(null);
    setListening(true);
    stopListening.current = listen(
      (heard) => {
        setText(heard);
        setAttempted(false);
        setConfirmDuplicate(false);
        setDateOverride(undefined);
      },
      (error) => {
        setListening(false);
        setVoiceError(error);
        stopListening.current = null;
        input.current?.focus();
      },
    );
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

  const syncScroll = () => {
    if (mirror.current && input.current) mirror.current.scrollLeft = input.current.scrollLeft;
  };

  const categoryValue = category ?? (parsed?.unsure ? '' : (parsed?.categoryId ?? ''));
  const showUnsure = parsed?.unsure === true && category === undefined;
  const color = categories.find((c) => c.id === (category ?? parsed?.categoryId))?.color;
  const upcoming = date > today;

  const openDatePicker = () => {
    const el = datePicker.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  return (
    <section className="card quick-add">
      <h2>
        <label htmlFor="quick-add-input">Quick add</label>
      </h2>
      <div className={voice ? 'qa-field qa-has-mic' : 'qa-field'}>
        <div className="qa-mirror" ref={mirror} aria-hidden="true">
          {segments.map((s, i) =>
            s.kind ? (
              <mark key={i} className={`qa-mark qa-${s.kind}`}>
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </div>
        <input
          ref={input}
          id="quick-add-input"
          className="input qa-input"
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
            setConfirmDuplicate(false);
            setDateOverride(undefined);
          }}
          onKeyDown={onKeyDown}
          onScroll={syncScroll}
          onKeyUp={syncScroll}
          onSelect={syncScroll}
        />
        {voice && (
          <button
            type="button"
            className="btn btn-ghost btn-icon qa-mic"
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Speak an entry'}
            onClick={toggleVoice}
          >
            <Icon name="mic" />
          </button>
        )}
      </div>
      {listening && (
        <p className="muted small" role="status">
          Listening. Say something like “chai twenty cash”. Your browser&rsquo;s speech service may
          process the audio online.
        </p>
      )}
      {voiceError && (
        <p className="warning" role="alert">
          {voiceError}
        </p>
      )}
      {!parsed && (
        <p id="quick-add-help" className="muted small">
          Type what, how much and when. Press Enter to save, Escape to clear.
        </p>
      )}
      {parsed && (
        <ul className="chips" aria-label="What Ledger understood" id="quick-add-help">
          <li className="chip chip-amount" data-testid="chip-amount">
            {parsed.amountMinor !== null ? (
              <span className="amt">{fmtMoney(parsed.amountMinor, { currency })}</span>
            ) : (
              <span className="muted">No amount yet</span>
            )}
          </li>
          <li className="chip chip-date" data-testid="chip-date">
            <button
              type="button"
              className="chip-button"
              aria-label={`Date: ${dateLabel(date, today)}. Change`}
              onClick={openDatePicker}
            >
              {dateLabel(date, today)}
            </button>
            {upcoming && <span className="chip-note">Upcoming</span>}
            <input
              ref={datePicker}
              type="date"
              className="visually-hidden"
              tabIndex={-1}
              aria-label="Entry date"
              value={parseISO(date) ? date : ''}
              onChange={(e) => {
                if (parseISO(e.target.value)) setDateOverride(e.target.value);
              }}
            />
          </li>
          {monthKey(date) !== monthKey(today) && (
            <li className="chip chip-note" data-testid="chip-month">
              Saves to {monthLabel(monthKey(date))}
            </li>
          )}
          <li className="chip chip-category" data-testid="chip-category">
            {color && !showUnsure && <span className="dot" style={{ background: color }} />}
            <label className="visually-hidden" htmlFor="quick-add-category">
              Category
            </label>
            <select
              id="quick-add-category"
              className="select"
              value={categoryValue}
              onChange={(e) => setCategory(e.target.value || undefined)}
            >
              {showUnsure && <option value="">Pick a category</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </li>
          <li className="chip chip-method" data-testid="chip-method">
            <label className="visually-hidden" htmlFor="quick-add-method">
              Paid by
            </label>
            <select
              id="quick-add-method"
              className="select"
              value={method}
              onChange={(e) => setMethodOverride(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </li>
        </ul>
      )}
      {showUnsure && (
        <p className="muted small">
          Not sure where this goes. Pick a category and Ledger will remember it.
        </p>
      )}
      {duplicate && confirmDuplicate && (
        <p className="warning" role="alert">
          This looks like a repeat of {duplicate.merchant} on {fmtDate(duplicate.date)}. Press Enter
          again to keep both.
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
