import { useLedger } from '../data/store';
import { isSampleId } from '../domain/sample';
import { tl } from '../domain/i18n';

/** True while sample entries are in the ledger. */
export function useHasSample(): boolean {
  return useLedger((s) => s.sample !== null || s.transactions.some((t) => isSampleId(t.id)));
}

export function LoadSampleButton({ className = 'btn' }: { className?: string }) {
  const load = useLedger((s) => s.loadSampleData);
  const has = useHasSample();
  if (has) return null;
  return (
    <button type="button" className={className} onClick={() => void load()}>
      {tl('Load sample data')}
    </button>
  );
}

/** On the Dashboard while sample data is loaded: a reminder and the way out. */
export function SampleBanner() {
  const has = useHasSample();
  const remove = useLedger((s) => s.removeSampleData);
  if (!has) return null;
  return (
    <div
      className="banner"
      role="region"
      aria-label={tl('Sample data')}
      data-testid="sample-banner"
    >
      <p>
        {tl(
          'You are looking at sample data: three months of made-up spending with salary, accounts and a credit card, recurring payments, budgets, udhaar with friends, a bike loan, savings goals, a wishlist, gold and an FD, and a weekend trip. Look around every page; your own entries stay when you remove it.',
        )}
      </p>
      <button type="button" className="btn" onClick={() => void remove()}>
        {tl('Remove sample data')}
      </button>
    </div>
  );
}

/** Settings card: load or remove the sample. */
export function SampleCard() {
  const has = useHasSample();
  const remove = useLedger((s) => s.removeSampleData);
  return (
    <section className="card" aria-labelledby="sample-title">
      <h2 id="sample-title">{tl('Sample data')}</h2>
      <p className="muted small">
        {has
          ? tl(
              'Sample data is loaded. Removing it deletes only what the sample added: its entries, recurring payments, accounts, money in, udhaar, loan, goals, wishes, assets and trip, and its budgets unless you changed them.',
            )
          : tl(
              'See how every part of Ledger works with three months of made-up spending, salary, accounts, budgets, udhaar, a loan, goals, a wishlist, assets and a trip. It sits alongside your own entries and comes out again in one tap.',
            )}
      </p>
      <div className="btn-row">
        {has ? (
          <button type="button" className="btn" onClick={() => void remove()}>
            {tl('Remove sample data')}
          </button>
        ) : (
          <LoadSampleButton />
        )}
      </div>
    </section>
  );
}
