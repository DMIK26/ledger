import { useLedger } from '../data/store';
import { isSampleId } from '../domain/sample';

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
      Load sample data
    </button>
  );
}

/** On the Dashboard while sample data is loaded: a reminder and the way out. */
export function SampleBanner() {
  const has = useHasSample();
  const remove = useLedger((s) => s.removeSampleData);
  if (!has) return null;
  return (
    <div className="banner" role="region" aria-label="Sample data" data-testid="sample-banner">
      <p>
        You are looking at sample data: three months of made-up spending, five recurring payments
        and budgets. Try pinning, drilling into the charts and asking the pencil. Your own entries
        stay when you remove it.
      </p>
      <button type="button" className="btn" onClick={() => void remove()}>
        Remove sample data
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
      <h2 id="sample-title">Sample data</h2>
      <p className="muted small">
        {has
          ? 'Sample data is loaded. Removing it deletes only the sample entries, recurring payments and the budgets it added (unless you changed them).'
          : 'See how Ledger works with three months of made-up spending, recurring payments and budgets. It sits alongside your own entries and comes out again in one tap.'}
      </p>
      <div className="btn-row">
        {has ? (
          <button type="button" className="btn" onClick={() => void remove()}>
            Remove sample data
          </button>
        ) : (
          <LoadSampleButton />
        )}
      </div>
    </section>
  );
}
