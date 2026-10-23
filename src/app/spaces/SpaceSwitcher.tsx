import { useLedger } from '../../data/store';
import type { SpaceView } from '../../domain/spaces';
import { tl } from '../../domain/i18n';

/**
 * The ledger on screen (Drop 13): Personal, the shop, or both together. Shown on every page once
 * Settings > Spaces is on; the choice is remembered on this device.
 */
export function SpaceSwitcher() {
  const on = useLedger((s) => s.settings.spacesOn);
  const space = useLedger((s) => s.settings.space);
  const shopName = tl(useLedger((s) => s.settings.shopName) || 'Shop');
  const setSetting = useLedger((s) => s.setSetting);
  if (!on) return null;
  const options: Array<{ id: SpaceView; label: string }> = [
    { id: 'personal', label: tl('Personal') },
    { id: 'shop', label: shopName },
    { id: 'both', label: tl('Both') },
  ];
  return (
    <div className="segmented space-switch" role="group" aria-label={tl('Ledger')}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={space === o.id}
          data-testid={`space-${o.id}`}
          onClick={() => void setSetting('space', o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Where budgets and goals are planned: one ledger at a time. Shown in Both. */
export function PickASpace({ what }: { what: string }) {
  const shopName = tl(useLedger((s) => s.settings.shopName) || 'Shop');
  const setSetting = useLedger((s) => s.setSetting);
  return (
    <section className="card" aria-labelledby="pick-space-title" data-testid="pick-space">
      <h2 id="pick-space-title">{tl('Pick a ledger for {0}', what)}</h2>
      <p className="muted small">
        {tl(
          '{0} belong to one ledger. Both shows the two together for reading only.',
          what.charAt(0).toUpperCase() + what.slice(1),
        )}
      </p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => void setSetting('space', 'personal')}>
          {tl('Personal')}
        </button>
        <button type="button" className="btn" onClick={() => void setSetting('space', 'shop')}>
          {shopName}
        </button>
      </div>
    </section>
  );
}
