import { useId } from 'react';
import { useLedger } from '../../data/store';
import { fmtMoney } from '../../domain/money';
import { SPLIT_MODE_LABEL, shareAmounts, type SplitMode } from '../../domain/splits';
import { AmountInput } from '../AmountInput';
import { Icon } from '../icons';
import { usePrivacy } from '../Money';
import {
  isMe,
  previewParts,
  rowKey,
  splitProblem,
  type SplitRow,
  type SplitState,
} from './splitForm';
import { tl } from '../../domain/i18n';

/**
 * Splitting an expense (Drop 11): who shared it, how, and who paid. Your share is what counts as your
 * spending; the others' shares become udhaar when it is saved.
 */
export function SplitEditor({
  totalMinor,
  state,
  onChange,
}: {
  totalMinor: number | null;
  state: SplitState;
  onChange: (next: SplitState) => void;
}) {
  const uid = useId();
  const people = useLedger((s) => s.people);
  const currency = useLedger((s) => s.settings.currency);
  usePrivacy();
  const set = (patch: Partial<SplitState>) => onChange({ ...state, ...patch });
  const setRow = (key: string, patch: Partial<SplitRow>) =>
    set({ rows: state.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const result =
    totalMinor && totalMinor > 0 ? shareAmounts(totalMinor, state.mode, previewParts(state)) : null;
  const problem = splitProblem(state);
  const label = (r: SplitRow) => (isMe(r) ? tl('You') : r.name.trim() || tl('Someone'));
  const mine = result?.ok ? (result.shares[state.rows.findIndex(isMe)] ?? 0) : null;

  return (
    <fieldset className="split" data-testid="split">
      <legend>{tl('Split')}</legend>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${uid}-mode`}>{tl('How')}</label>
          <select
            id={`${uid}-mode`}
            className="select input"
            value={state.mode}
            onChange={(e) => set({ mode: e.target.value as SplitMode })}
          >
            {(Object.keys(SPLIT_MODE_LABEL) as SplitMode[]).map((m) => (
              <option key={m} value={m}>
                {SPLIT_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-paid`}>{tl('Who paid')}</label>
          <select
            id={`${uid}-paid`}
            className="select input"
            value={state.paidBy}
            onChange={(e) => set({ paidBy: e.target.value })}
          >
            {state.rows.map((r) => (
              <option key={r.key} value={r.key}>
                {label(r)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <datalist id={`${uid}-people`}>
        {people.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <ul className="split-rows">
        {state.rows.map((r, i) => (
          <li key={r.key} className="split-row">
            {isMe(r) ? (
              <span className="split-name">{tl('You')}</span>
            ) : (
              <span className="split-name">
                <label className="visually-hidden" htmlFor={`${uid}-name-${r.key}`}>
                  {tl('Person {0}', i)}
                </label>
                <input
                  id={`${uid}-name-${r.key}`}
                  className="input"
                  list={`${uid}-people`}
                  autoComplete="off"
                  placeholder={tl('Name')}
                  value={
                    r.personId ? (people.find((p) => p.id === r.personId)?.name ?? r.name) : r.name
                  }
                  onChange={(e) => {
                    const typed = e.target.value;
                    const known = people.find(
                      (p) => p.name.toLowerCase() === typed.trim().toLowerCase(),
                    );
                    setRow(r.key, { personId: known ? known.id : null, name: typed });
                  }}
                />
              </span>
            )}
            {state.mode === 'exact' ? (
              <span className="split-value">
                <AmountInput
                  key={`${r.key}-exact`}
                  id={`${uid}-v-${r.key}`}
                  ariaLabel={tl('Amount for {0}', label(r))}
                  initialMinor={r.minor}
                  onChange={(v) => setRow(r.key, { minor: v })}
                />
              </span>
            ) : state.mode !== 'equal' ? (
              <span className="split-value">
                <input
                  className="input"
                  inputMode={state.mode === 'percent' ? 'decimal' : 'numeric'}
                  autoComplete="off"
                  aria-label={tl(
                    '{0} for {1}',
                    state.mode === 'percent' ? tl('Percentage') : tl('Shares'),
                    label(r),
                  )}
                  placeholder={state.mode === 'percent' ? '%' : '1'}
                  value={r.value}
                  onChange={(e) => setRow(r.key, { value: e.target.value })}
                />
              </span>
            ) : null}
            <span className="split-share small" data-testid={`share-${isMe(r) ? 'me' : i}`}>
              {result?.ok ? fmtMoney(result.shares[i]!, { currency }) : ''}
            </span>
            {!isMe(r) && (
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={tl('Remove {0} from the split', label(r))}
                onClick={() =>
                  set({
                    rows: state.rows.filter((x) => x.key !== r.key),
                    paidBy: state.paidBy === r.key ? 'me' : state.paidBy,
                  })
                }
              >
                <Icon name="close" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() =>
          set({
            rows: [
              ...state.rows,
              { key: rowKey(), personId: null, name: '', value: '', minor: null },
            ],
          })
        }
      >
        <Icon name="plus" />
        {tl('Add person')}
      </button>
      <p className="small" aria-live="polite" data-testid="split-summary">
        {problem
          ? problem
          : !result
            ? tl('Enter the whole bill above to see the shares.')
            : !result.ok
              ? result.error
              : mine === 0
                ? tl('Your share is zero; record lending in Udhaar instead.')
                : state.paidBy === 'me'
                  ? tl(
                      'Your share, {0}, is your spending; the others owe you theirs.',
                      fmtMoney(mine ?? 0, { currency }),
                    )
                  : tl(
                      'Your share, {0}, is your spending; you owe it to {1}.',
                      fmtMoney(mine ?? 0, { currency }),
                      label(state.rows.find((r) => r.key === state.paidBy)!),
                    )}
      </p>
    </fieldset>
  );
}
