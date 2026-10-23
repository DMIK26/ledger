import { useState } from 'react';
import { useLedger } from '../../data/store';
import { tl } from '../../domain/i18n';

const MAX_SHOP_NAME = 30;

/** Settings > Spaces (Drop 13): a Shop ledger beside the personal one. */
export function SpacesCard() {
  const on = useLedger((s) => s.settings.spacesOn);
  const shopName = useLedger((s) => s.settings.shopName);
  const setSetting = useLedger((s) => s.setSetting);
  const [name, setName] = useState(shopName);
  const save = () => {
    const n = name.trim().replace(/\s+/g, ' ');
    if (n && n !== shopName) void setSetting('shopName', n);
    else setName(shopName);
  };
  return (
    <section className="card" aria-labelledby="spaces-title">
      <h2 id="spaces-title">{tl('Spaces')}</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            void setSetting('spacesOn', e.target.checked).then(() => {
              if (!e.target.checked) void setSetting('space', 'personal');
            });
          }}
        />
        {tl('Keep a Shop ledger as well')}
      </label>
      {on && (
        <div className="field-row">
          <label htmlFor="shop-name">{tl('The shop’s name')}</label>
          <input
            id="shop-name"
            className="input"
            autoComplete="off"
            maxLength={MAX_SHOP_NAME}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </div>
      )}
      <p className="muted small">
        {tl(
          'Each ledger keeps its own entries, money in, accounts, budgets, recurring payments, udhaar, loans, goals and trips. Categories, rules and settings are shared. A switcher on every page picks Personal, the shop or both. Turning this off hides the shop’s ledger; nothing is deleted.',
        )}
      </p>
    </section>
  );
}
