import { useEffect, useRef, useState } from 'react';
import { useLedger } from '../data/store';
import { evaluateAmount, looksLikeMaths } from '../domain/calc';
import { fmtMoney, minorToInput, parseAmountToMinor } from '../domain/money';
import { usePrivacy } from './Money';

interface Props {
  id: string;
  /** Starting value. Change the component's `key` to load a different one. */
  initialMinor: number | null;
  onChange: (minor: number | null) => void;
  onBlur?: () => void;
  invalid?: boolean;
  /** For fields without a visible label. */
  ariaLabel?: string;
}

/**
 * An amount field that never writes digits into a DOM attribute: the value is set as a property only,
 * so privacy mode's leak checks (text, attributes, title) stay clean, and it is masked on screen.
 * It also does sums: "250+120/2" shows "= ₹310" while typing and becomes 310 when the field is left.
 */
export function AmountInput({ id, initialMinor, onChange, onBlur, invalid, ariaLabel }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const masked = usePrivacy();
  const currency = useLedger((s) => s.settings.currency);
  const [sum, setSum] = useState<{ ok: true; minor: number } | { ok: false; error: string } | null>(
    null,
  );

  useEffect(() => {
    if (ref.current) ref.current.value = initialMinor !== null ? minorToInput(initialMinor) : '';
    // Only on mount: the parent remounts with a new key to load another value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <input
        ref={ref}
        id={id}
        className="input amt-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        data-masked={masked ? '' : undefined}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-describedby={sum ? `${id}-sum` : undefined}
        onBlur={(e) => {
          if (sum?.ok) {
            e.currentTarget.value = minorToInput(sum.minor);
            setSum(null);
          }
          onBlur?.();
        }}
        onInput={(e) => {
          const text = e.currentTarget.value;
          if (looksLikeMaths(text)) {
            const r = evaluateAmount(text);
            setSum(r);
            onChange(r.ok ? r.minor : null);
            return;
          }
          setSum(null);
          onChange(text.trim() ? parseAmountToMinor(text) : null);
        }}
      />
      {sum && (
        <span id={`${id}-sum`} className="amt-sum small" aria-live="polite">
          {sum.ok ? `= ${fmtMoney(sum.minor, { currency })}` : sum.error}
        </span>
      )}
    </>
  );
}
