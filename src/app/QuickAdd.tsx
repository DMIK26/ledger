import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLedger } from '../data/store';
import { addDays, fmtDate, monthKey, monthLabel, parseISO, todayISO } from '../domain/dates';
import { findDuplicate } from '../domain/duplicates';
import { highlightSegments } from '../domain/highlight';
import { fmtMoney } from '../domain/money';
import { parseQuickEntry } from '../domain/parser';
import { repeatChips } from '../domain/repeat';
import { INCOME_KINDS, type IncomeKind } from '../domain/accounts';
import { PAYMENT_METHODS, type PaymentMethod } from '../domain/types';
import { usePrivacy } from './Money';
import { Icon } from './icons';
import { listen, voiceMode } from './voice';
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
  const customRules = useLedger((s) => s.customRules);
  const transactions = useLedger((s) => s.transactions);
  const lastMethod = useLedger((s) => s.settings.lastMethod);
  const currency = useLedger((s) => s.settings.currency);
  const addFromParsed = useLedger((s) => s.addFromParsed);
  const addRepeat = useLedger((s) => s.addRepeat);
  const addIncomeFromParsed = useLedger((s) => s.addIncomeFromParsed);
  const favourites = useLedger((s) => s.favourites);
  const viewMonth = useViewMonth();
  const setMonth = useView((s) => s.setMonth);
  const announce = useView((s) => s.announce);
  usePrivacy(); // re-render the amount chip when privacy changes

  const [text, setText] = useState('');
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [dateOverride, setDateOverride] = useState<string | undefined>(undefined);
  const [methodOverride, setMethodOverride] = useState<PaymentMethod | undefined>(undefined);
  const [kindOverride, setKindOverride] = useState<'expense' | 'income' | undefined>(undefined);
  const [incomeKind, setIncomeKind] = useState<IncomeKind | undefined>(undefined);
  const [attempted, setAttempted] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voice] = useState(voiceMode);
  const [keyboardTip, setKeyboardTip] = useState(false);
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
    () =>
      text.trim()
        ? parseQuickEntry(text, { today, lastMethod, rules, customRules, categories })
        : null,
    [text, today, lastMethod, rules, customRules, categories],
  );
  const segments = useMemo(() => (parsed ? highlightSegments(parsed) : []), [parsed]);
  const chips = useMemo(
    () => repeatChips(favourites, transactions, today),
    [favourites, transactions, today],
  );

  const repeat = async (index: number) => {
    const item = chips[index];
    if (!item || saving) return;
    setSaving(true);
    try {
      await addRepeat(item);
      if (followMonth && monthKey(today) !== viewMonth) {
        setMonth(monthKey(today));
        announce(`Saved to ${monthLabel(monthKey(today))}. Showing that month.`);
      }
    } finally {
      setSaving(false);
    }
  };

  const date = dateOverride ?? parsed?.date ?? today;
  const method = methodOverride ?? parsed?.method ?? lastMethod;
  // A picked date replaces a typed one, so the typed date's error no longer applies.
  const errors = parsed ? (dateOverride ? [] : [...parsed.errors]) : [];
  if (parsed && attempted && parsed.amountMinor === null) errors.push('Add an amount to save');
  const canSave =
    parsed !== null && parsed.amountMinor !== null && parsed.amountMinor > 0 && errors.length === 0;

  const kind = kindOverride ?? parsed?.kind ?? 'expense';
  const isIncome = kind === 'income';
  const duplicate =
    !isIncome && parsed && parsed.amountMinor !== null
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
    setKindOverride(undefined);
    setIncomeKind(undefined);
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
      if (isIncome)
        await addIncomeFromParsed(
          { ...parsed, ok: true, errors: [] },
          { date: dateOverride, method: methodOverride, incomeKind },
        );
      else
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
    if (voice === 'keyboard') {
      // An iPhone home-screen app cannot use the speech API; the keyboard's own mic can.
      input.current?.focus();
      setKeyboardTip(true);
      return;
    }
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
  const showUnsure = !isIncome && parsed?.unsure === true && category === undefined;
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
      <div className={voice !== 'none' ? 'qa-field qa-has-mic' : 'qa-field'}>
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
            // Typing takes over from listening, so the words heard do not overwrite it.
            if (listening) stopListening.current?.();
            setKeyboardTip(false);
            setText(e.target.value);
            setAttempted(false);
            setConfirmDuplicate(false);
            setDateOverride(undefined);
            setKindOverride(undefined);
          }}
          onKeyDown={onKeyDown}
          onScroll={syncScroll}
          onKeyUp={syncScroll}
          onSelect={syncScroll}
        />
        {voice !== 'none' && (
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
      {keyboardTip && !text && (
        <p className="muted small" role="status">
          Tap the mic on your keyboard and say something like “chai twenty cash”.
        </p>
      )}
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
      {!text && chips.length > 0 && (
        <div className="repeat-row" role="group" aria-labelledby="repeat-label">
          <span id="repeat-label" className="muted small">
            Repeat for today
          </span>
          <ul className="repeat-chips">
            {chips.map((c, i) => (
              <li key={c.key}>
                <button
                  type="button"
                  className="repeat-chip"
                  data-testid="repeat-chip"
                  aria-label={`Add ${c.merchant}, ${fmtMoney(c.amountMinor, { currency })}, for today`}
                  disabled={saving}
                  onClick={() => void repeat(i)}
                >
                  {c.favouriteId && (
                    <span className="repeat-star" aria-hidden="true">
                      <Icon name="star" size={14} />
                    </span>
                  )}
                  <span className="repeat-name">{c.merchant}</span>
                  <span className="amt">{fmtMoney(c.amountMinor, { currency })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
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
          {(isIncome || parsed.kind === 'income') && (
            <li className="chip chip-income" data-testid="chip-income">
              <button
                type="button"
                className="chip-button"
                aria-pressed={isIncome}
                onClick={() => setKindOverride(isIncome ? 'expense' : 'income')}
              >
                {isIncome ? 'Money in' : 'Spending'}
              </button>
            </li>
          )}
          {isIncome && (
            <li className="chip chip-category" data-testid="chip-income-kind">
              <label className="visually-hidden" htmlFor="quick-add-income-kind">
                Kind of money in
              </label>
              <select
                id="quick-add-income-kind"
                className="select"
                value={incomeKind ?? parsed.incomeKind}
                onChange={(e) => setIncomeKind(e.target.value as IncomeKind)}
              >
                {(Object.keys(INCOME_KINDS) as IncomeKind[]).map((k) => (
                  <option key={k} value={k}>
                    {INCOME_KINDS[k]}
                  </option>
                ))}
              </select>
            </li>
          )}
          {!isIncome && (
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
          )}
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
