import { cardsDueSoon, type Account, type MoneyData } from './accounts';
import { addDays } from './dates';
import { nextOccurrence, type RecurringItem } from './recurring';
import type { ISODate } from './types';

/**
 * The number on the app icon (Drop 13): bills due in the next seven days, that is recurring payments
 * and card payments, from every ledger.
 */
export function billsDue(
  recurring: readonly RecurringItem[],
  accounts: readonly Account[],
  data: MoneyData,
  today: ISODate,
): number {
  const end = addDays(today, 7);
  const payments = recurring.filter((r) => {
    const next = nextOccurrence(r, today);
    return next >= today && next <= end;
  }).length;
  return payments + cardsDueSoon(accounts, data, today).length;
}
