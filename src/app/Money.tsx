import { useSyncExternalStore } from 'react';
import { fmtMoney, isPrivacyOn, subscribePrivacy } from '../domain/money';

export function usePrivacy(): boolean {
  return useSyncExternalStore(subscribePrivacy, isPrivacyOn, isPrivacyOn);
}

interface MoneyProps {
  minor: number;
  currency?: string;
  compact?: boolean;
  signed?: boolean;
  className?: string;
}

/** The only way an amount reaches the screen. In privacy mode it renders a fixed mask, never digits. */
export function Money({ minor, currency, compact, signed, className }: MoneyProps) {
  const masked = usePrivacy();
  const text = fmtMoney(minor, { currency, compact, signed });
  return (
    <span className={className ? `amt ${className}` : 'amt'} data-masked={masked ? '' : undefined}>
      {text}
    </span>
  );
}
