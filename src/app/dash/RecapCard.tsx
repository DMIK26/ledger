import { useLedger } from '../../data/store';
import { dueRecap } from '../../domain/recap';
import { useUi } from '../../kit/ui';

/**
 * Offers a new recap once (Drop 11): last week, last month or the financial year. Opening it or
 * putting it away remembers it, so it never comes back on its own.
 */
export function RecapCard({ today }: { today: string }) {
  const transactions = useLedger((s) => s.transactions);
  const seen = useLedger((s) => s.settings.recapsSeen);
  const fyStart = useLedger((s) => s.settings.fyStartMonth);
  const setSetting = useLedger((s) => s.setSetting);
  const openRecap = useUi((s) => s.openRecap);
  const due = dueRecap(today, seen, transactions, fyStart);
  if (!due) return null;
  const what =
    due.kind === 'week' ? 'Your week' : due.kind === 'month' ? due.label : `Your ${due.label}`;
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
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void setSetting('recapsSeen', [...seen, due.id])}
        >
          Not interested
        </button>
      </div>
    </section>
  );
}
