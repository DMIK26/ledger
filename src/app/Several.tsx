import { useId, useMemo, useState } from 'react';
import { useLedger } from '../data/store';
import { categoryById } from '../domain/categories';
import { fmtDate, parseISO, todayISO } from '../domain/dates';
import { fmtMoney } from '../domain/money';
import { parseQuickEntry } from '../domain/parser';
import { usePrivacy } from './Money';
import { methodLabel } from '../domain/types';
import { tl } from '../domain/i18n';

export const MAX_LINES = 50;

/** One entry per line, the quick-add way; a preview shows what each becomes before one undoable save. */
export function Several({ initialDate, onDone }: { initialDate?: string; onDone: () => void }) {
  const uid = useId();
  const categories = useLedger((s) => s.categories);
  const rules = useLedger((s) => s.rules);
  const customRules = useLedger((s) => s.customRules);
  const lastMethod = useLedger((s) => s.settings.lastMethod);
  const currency = useLedger((s) => s.settings.currency);
  const addMany = useLedger((s) => s.addMany);
  usePrivacy();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const today = todayISO();

  const lines = useMemo(
    () =>
      text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, MAX_LINES)
        .map((l) => parseQuickEntry(l, { today, lastMethod, rules, customRules, categories }))
        // Opened for a day (from the check-in): lines without a date go on that day.
        .map((p) =>
          initialDate && parseISO(initialDate) && p.dateSource === 'today'
            ? { ...p, date: initialDate, upcoming: false }
            : p,
        ),
    [text, today, lastMethod, rules, customRules, categories, initialDate],
  );
  const good = lines.filter((p) => p.ok);
  const tooMany = text.split('\n').filter((l) => l.trim()).length > MAX_LINES;

  const save = async () => {
    if (saving || good.length === 0) return;
    setSaving(true);
    try {
      await addMany(lines);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="several">
      <div className="field">
        <label htmlFor={`${uid}-lines`}>{tl('One entry per line')}</label>
        <textarea
          id={`${uid}-lines`}
          className="input textarea several-input"
          rows={5}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={tl('chai 20 cash\nauto 40+30 yesterday\nlunch 180 upi')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="muted small">
          {tl('Each line works like quick add: what, how much and when. Sums are fine.')}
        </p>
      </div>
      {lines.length > 0 && (
        <ol className="several-preview" aria-label={tl('What each line becomes')}>
          {lines.map((p, i) => {
            const problem = p.errors[0] ?? (p.amountMinor === null ? tl('No amount') : null);
            return (
              <li key={i} className={problem ? 'several-bad' : undefined}>
                <span className="several-merchant">{p.merchant}</span>
                <span className="muted small">
                  {fmtDate(p.date)} · {categoryById(categories, p.categoryId)?.name ?? tl('Other')}
                  {p.unsure ? ' ' + tl('(a guess)') : ''} · {methodLabel(p.method)}
                </span>
                {problem ? (
                  <span className="several-problem">{tl('{0}, skipped', problem)}</span>
                ) : (
                  <span className="amt">{fmtMoney(p.amountMinor!, { currency })}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {tooMany && <p className="warning">{tl('Only the first {0} lines are used.', MAX_LINES)}</p>}
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || good.length === 0}
          onClick={() => void save()}
        >
          {good.length === 1 ? tl('Save 1 entry') : tl('Save {0} entries', good.length)}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {tl('Cancel')}
        </button>
      </div>
    </div>
  );
}
