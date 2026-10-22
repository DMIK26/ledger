import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useLedger } from '../data/store';
import { evaluateAmount } from '../domain/calc';
import { categorise } from '../domain/categoriser';
import { parseISO, todayISO } from '../domain/dates';
import { fmtMoney, maskedMoney } from '../domain/money';
import { PAYMENT_METHODS, type PaymentMethod } from '../domain/types';
import { Icon } from './icons';
import { usePrivacy } from './Money';

const OPERATORS = ['+', '−', '×', '÷'] as const;
const MAX_LENGTH = 32;

/** Applies one key to the expression, refusing what cannot make sense (two operators, two points). */
export function pressKey(expr: string, key: string): string {
  if (key === 'back') return expr.slice(0, -1);
  if (key === 'clear') return '';
  if (expr.length >= MAX_LENGTH) return expr;
  const last = expr.slice(-1);
  const lastIsOp = (OPERATORS as readonly string[]).includes(last);
  if ((OPERATORS as readonly string[]).includes(key)) {
    if (!expr) return expr;
    return lastIsOp ? expr.slice(0, -1) + key : expr + key;
  }
  if (key === '.') {
    const current = expr.split(/[+−×÷]/).pop() ?? '';
    if (current.includes('.')) return expr;
    return expr + (current === '' ? '0.' : '.');
  }
  if (/^\d$/.test(key)) {
    const current = expr.split(/[+−×÷]/).pop() ?? '';
    const decimals = current.includes('.') ? current.split('.')[1]!.length : 0;
    if (decimals >= 2) return expr;
    if (current === '0') return expr.slice(0, -1) + key;
    return expr + key;
  }
  return expr;
}

const KEY_MAP: Record<string, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  x: '×',
  X: '×',
  '/': '÷',
  '.': '.',
  ',': '.',
  Backspace: 'back',
  Delete: 'clear',
};

const ROWS = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['.', '0', 'back', '+'],
];

const KEY_LABEL: Record<string, string> = {
  '÷': 'Divide',
  '×': 'Times',
  '−': 'Minus',
  '+': 'Plus',
  '.': 'Point',
  back: 'Delete',
};

/**
 * Amount first, then one tap on a category saves it (Monefy's two-tap entry). The display does sums;
 * "What for", the date and the method are optional. Hardware keys work while the pad has focus.
 */
export function Keypad({ initialDate, onDone }: { initialDate?: string; onDone: () => void }) {
  const uid = useId();
  const categories = useLedger((s) => s.categories);
  const rules = useLedger((s) => s.rules);
  const lastMethod = useLedger((s) => s.settings.lastMethod);
  const currency = useLedger((s) => s.settings.currency);
  const addEntry = useLedger((s) => s.addEntry);
  const masked = usePrivacy();
  const [expr, setExpr] = useState('');
  const [what, setWhat] = useState('');
  const [date, setDate] = useState(initialDate && parseISO(initialDate) ? initialDate : todayISO());
  const [method, setMethod] = useState<PaymentMethod>(lastMethod);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pad = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pad.current?.focus();
  }, []);

  const result = expr ? evaluateAmount(expr.replace(/−/g, '-')) : null;
  const amount = result?.ok ? result.minor : null;
  const hasOperator = /[+−×÷]/.test(expr);
  const guess = what.trim() ? categorise(what, rules) : null;
  const suggested = guess && guess.confidence !== 'none' ? guess.categoryId : null;

  const press = (key: string) => {
    setError(null);
    setExpr((e) => pressKey(e, key));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = /^\d$/.test(e.key) ? e.key : KEY_MAP[e.key];
    if (key) {
      e.preventDefault();
      press(key);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      grid.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  };

  const save = async (categoryId: string) => {
    if (saving) return;
    if (amount === null) {
      setError(result && !result.ok ? result.error : 'Type an amount first');
      pad.current?.focus();
      return;
    }
    if (!parseISO(date)) {
      setError('Pick a valid date');
      return;
    }
    const name = categories.find((c) => c.id === categoryId)?.name ?? 'Expense';
    setSaving(true);
    try {
      await addEntry(
        {
          date,
          amountMinor: amount,
          merchant: what.trim() || name,
          categoryId,
          method,
          notes: '',
          tags: [],
        },
        undefined,
        'keypad',
      );
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const shown =
    amount !== null
      ? fmtMoney(amount, { currency })
      : masked
        ? maskedMoney(currency)
        : fmtMoney(0, { currency });

  return (
    <div className="keypad-entry">
      <div
        ref={pad}
        className="keypad"
        tabIndex={0}
        role="group"
        aria-label="Amount keypad. Type digits and + − × ÷, Enter to choose a category."
        onKeyDown={onKey}
      >
        <div className="keypad-display">
          <p className="keypad-expr muted" aria-hidden="true" data-masked={masked ? '' : undefined}>
            {hasOperator ? (masked ? '•'.repeat(Math.min(expr.length, 12)) : expr) : ' '}
          </p>
          <p className="keypad-amount" aria-live="polite" data-testid="keypad-amount">
            {shown}
          </p>
        </div>
        <div className="keypad-keys">
          {ROWS.flat().map((k) => (
            <button
              key={k}
              type="button"
              className={`keypad-key${/^\d$|\./.test(k) ? '' : ' keypad-op'}`}
              aria-label={KEY_LABEL[k]}
              tabIndex={-1}
              onClick={() => press(k)}
            >
              {k === 'back' ? <Icon name="backspace" /> : k}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
      <div className="keypad-what">
        <div className="field">
          <label htmlFor={`${uid}-what`}>What for (optional)</label>
          <input
            id={`${uid}-what`}
            className="input"
            type="text"
            autoComplete="off"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
          />
        </div>
      </div>
      <h3 className="keypad-pick" id={`${uid}-pick`}>
        Tap a category to save
      </h3>
      <div className="keypad-categories" ref={grid} role="group" aria-labelledby={`${uid}-pick`}>
        {categories
          .filter((c) => !c.archived)
          .map((c) => (
            <button
              key={c.id}
              type="button"
              className="keypad-category"
              data-suggested={c.id === suggested ? '' : undefined}
              aria-label={`Save ${shown} to ${c.name}`}
              disabled={saving}
              onClick={() => void save(c.id)}
            >
              <span className="dot" style={{ background: c.color }} aria-hidden="true" />
              {c.name}
            </button>
          ))}
      </div>
      <div className="keypad-details">
        <div className="field">
          <label htmlFor={`${uid}-date`}>Date</label>
          <input
            id={`${uid}-date`}
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-method`}>Paid by</label>
          <select
            id={`${uid}-method`}
            className="select input"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
