import { lazy, Suspense } from 'react';
import { useLedger } from '../../data/store';
import { dueRecap } from '../../domain/recap';
import { useUi } from '../../kit/ui';

// The weekly digest loads only on the days it shows (Drop 12).
const WeekDigest = lazy(() => import('./WeekDigest').then((m) => ({ default: m.WeekDigest })));

/**
 * Offers a new recap once (Drop 11): last week, last month or the financial year. Last week shows as
 * the weekly digest (Drop 12). Opening it or putting it away remembers it, so it never comes back.
 */
export function RecapCard({ today }: { today: string }) {
  const transactions = useLedger((s) => s.transactions);
  const seen = useLedger((s) => s.settings.recapsSeen);
  const fyStart = useLedger((s) => s.settings.fyStartMonth);
  const setSetting = useLedger((s) => s.setSetting);
  const openRecap = useUi((s) => s.openRecap);
  const due = dueRecap(today, seen, transactions, fyStart);
  if (!due) return null;
  const putAway = () => void setSetting('recapsSeen', [...seen, due.id]);
  if (due.kind === 'week')
    return (
      <Suspense fallback={null}>
        <WeekDigest period={due} today={today} onOpen={() => openRecap(due)} onDone={putAway} />
      </Suspense>
    );
  const what = due.kind === 'month' ? due.label : `Your ${due.label}`;
  return (
    <section
      className="card recap-offer"
      aria-labelledby="recap-offer-title"
      data-testid="recap-offer"
    >
      <h2 id="recap-offer-title">{what}, in a few cards</h2>
      <p className="muted small">
        {due.kind === 'month'
          ? 'Guess what you spent first, then see how it went.'
          : 'A short look back.'}
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={() => openRecap(due)}>
          Open the recap
        </button>
        <button type="button" className="btn btn-ghost" onClick={putAway}>
          Not interested
        </button>
      </div>
    </section>
  );
}
