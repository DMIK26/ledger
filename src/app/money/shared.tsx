import { useMemo } from 'react';
import { useLedger } from '../../data/store';
import { balances, type Account } from '../../domain/accounts';
import { todayISO } from '../../domain/dates';
import { tl } from '../../domain/i18n';

/** Everything the money views read, with every account's balance as of today. */
export function useMoneyData() {
  const accounts = useLedger((s) => s.accounts);
  const flows = useLedger((s) => s.flows);
  const udhaar = useLedger((s) => s.udhaar);
  const transactions = useLedger((s) => s.transactions);
  const today = todayISO();
  const data = useMemo(() => ({ transactions, flows, udhaar }), [transactions, flows, udhaar]);
  const balanceOf = useMemo(() => balances(accounts, data, today), [accounts, data, today]);
  return { accounts, flows, udhaar, transactions, data, balanceOf, today };
}

/** Accounts to choose from: open ones, plus the one already chosen even if archived. */
export function AccountSelect({
  id,
  value,
  onChange,
  accounts,
  allowNone = true,
  noneLabel = tl('No account'),
  exclude,
  filter,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  accounts: readonly Account[];
  allowNone?: boolean;
  noneLabel?: string;
  exclude?: string;
  filter?: (a: Account) => boolean;
}) {
  const options = accounts.filter(
    (a) => (a.id === value || !a.archived) && a.id !== exclude && (!filter || filter(a)),
  );
  return (
    <select
      id={id}
      className="select input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowNone && <option value="">{noneLabel}</option>}
      {options.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

export const accountName = (accounts: readonly Account[], id: string | undefined): string =>
  (id && accounts.find((a) => a.id === id)?.name) || tl('No account');
