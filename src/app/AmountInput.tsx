import { useEffect, useRef } from 'react';
import { minorToInput, parseAmountToMinor } from '../domain/money';
import { usePrivacy } from './Money';

interface Props {
  id: string;
  /** Starting value. Change the component's `key` to load a different one. */
  initialMinor: number | null;
  onChange: (minor: number | null) => void;
  invalid?: boolean;
}

/**
 * An amount field that never writes digits into a DOM attribute: the value is set as a property only,
 * so privacy mode's leak checks (text, attributes, title) stay clean, and it is masked on screen.
 */
export function AmountInput({ id, initialMinor, onChange, invalid }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const masked = usePrivacy();

  useEffect(() => {
    if (ref.current) ref.current.value = initialMinor !== null ? minorToInput(initialMinor) : '';
    // Only on mount: the parent remounts with a new key to load another value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
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
      onInput={(e) => {
        const text = e.currentTarget.value;
        onChange(text.trim() ? parseAmountToMinor(text) : null);
      }}
    />
  );
}
