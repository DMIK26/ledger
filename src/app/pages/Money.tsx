import { navigate } from '../router';
import { AccountsCard } from '../money/Accounts';
import { CashFlowCard } from '../money/CashFlow';
import { IncomeCard } from '../money/Income';
import { LoansView } from '../money/Loans';
import { NetWorthCard } from '../money/NetWorth';
import { UdhaarView } from '../money/Udhaar';
import { useMoneyData } from '../money/shared';

const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'udhaar', label: 'Udhaar' },
  { id: 'loans', label: 'Loans' },
] as const;
type View = (typeof VIEWS)[number]['id'];

/**
 * The whole money picture (Drop 9): money in, accounts and cards, udhaar and loans, and (Drop 10) net
 * worth. Spending pages stay spending-only; nothing here is ever counted as spending.
 */
export function MoneyPage({ view }: { view?: string | null }) {
  const current: View = view === 'udhaar' || view === 'loans' ? view : 'overview';
  const { today } = useMoneyData();
  return (
    <>
      <div className="segmented page-views" role="group" aria-label="Show">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={current === v.id}
            onClick={() => navigate(v.id === 'overview' ? '/money' : `/money?view=${v.id}`)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {current === 'overview' && (
        <>
          <CashFlowCard today={today} />
          <IncomeCard />
          <AccountsCard />
          <NetWorthCard />
        </>
      )}
      {current === 'udhaar' && <UdhaarView />}
      {current === 'loans' && <LoansView />}
    </>
  );
}
