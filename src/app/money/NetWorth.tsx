import { useMemo, useState, type FormEvent } from 'react';
import { useLedger } from '../../data/store';
import { fmtDate, monthLabel, monthShortLabel, parseISO, todayISO } from '../../domain/dates';
import { fmtMoney } from '../../domain/money';
import {
  ASSET_KIND_LABEL,
  latestValue,
  MAX_ASSET_NAME,
  netWorthAt,
  netWorthEmpty,
  netWorthHistory,
  type Asset,
  type AssetKind,
} from '../../domain/networth';
import { AmountInput } from '../AmountInput';
import { Icon } from '../icons';
import { Money, usePrivacy } from '../Money';
import { useMoneyData } from './shared';
import { tl } from '../../domain/i18n';

function AssetForm({ editing, onDone }: { editing?: Asset; onDone: () => void }) {
  const saveAsset = useLedger((s) => s.saveAsset);
  const [name, setName] = useState(editing?.name ?? '');
  const [kind, setKind] = useState<AssetKind>(editing?.kind ?? 'gold');
  const [value, setValue] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(tl('Give it a name, like “Gold coins” or “SBI FD”'));
    if (!editing && (value === null || value < 0))
      return setError(tl('Enter what it is worth now'));
    if (!parseISO(date)) return setError(tl('Pick a date'));
    await saveAsset({ name, kind, valueMinor: value ?? 0, date }, editing?.id);
    onDone();
  };
  const prefix = editing ? `asset-${editing.id}` : 'asset-new';
  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${prefix}-name`}>{tl('Name')}</label>
          <input
            id={`${prefix}-name`}
            className="input"
            autoComplete="off"
            maxLength={MAX_ASSET_NAME}
            placeholder={tl('Gold coins')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-kind`}>{tl('Kind')}</label>
          <select
            id={`${prefix}-kind`}
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind)}
          >
            {(Object.keys(ASSET_KIND_LABEL) as AssetKind[]).map((k) => (
              <option key={k} value={k}>
                {ASSET_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        {!editing && (
          <>
            <div className="field">
              <label htmlFor={`${prefix}-value`}>{tl('Worth now')}</label>
              <AmountInput id={`${prefix}-value`} initialMinor={null} onChange={setValue} />
            </div>
            <div className="field">
              <label htmlFor={`${prefix}-date`}>{tl('As of')}</label>
              <input
                id={`${prefix}-date`}
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary">
          {editing ? tl('Save changes') : tl('Add asset')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {tl('Cancel')}
        </button>
      </div>
    </form>
  );
}

function ValueForm({ asset, onDone }: { asset: Asset; onDone: () => void }) {
  const setAssetValue = useLedger((s) => s.setAssetValue);
  const [value, setValue] = useState<number | null>(latestValue(asset)?.valueMinor ?? null);
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (value === null || value < 0) return setError(tl('Enter what it is worth (0 if sold)'));
    if (!parseISO(date)) return setError(tl('Pick a date'));
    await setAssetValue(asset.id, value, date);
    onDone();
  };
  return (
    <form className="put-aside" onSubmit={(e) => void submit(e)} noValidate>
      <div className="field">
        <label htmlFor={`value-${asset.id}`}>{tl('Worth now')}</label>
        <AmountInput id={`value-${asset.id}`} initialMinor={value} onChange={setValue} />
      </div>
      <div className="field">
        <label htmlFor={`value-date-${asset.id}`}>{tl('As of')}</label>
        <input
          id={`value-date-${asset.id}`}
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary">
          {tl('Save value')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {tl('Cancel')}
        </button>
      </div>
    </form>
  );
}

function AssetRow({ asset }: { asset: Asset }) {
  const currency = useLedger((s) => s.settings.currency);
  const deleteAsset = useLedger((s) => s.deleteAsset);
  const [mode, setMode] = useState<'view' | 'value' | 'edit'>('view');
  const latest = latestValue(asset);
  if (mode === 'edit') return <AssetForm editing={asset} onDone={() => setMode('view')} />;
  return (
    <li className="asset-row" data-testid="asset-row">
      <div className="money-row">
        <span className="money-main">
          <span>{asset.name}</span>
          <span className="muted small">
            {ASSET_KIND_LABEL[asset.kind]}
            {latest ? tl(', as of {0}', fmtDate(latest.date)) : ''}
          </span>
        </span>
        <Money minor={latest?.valueMinor ?? 0} currency={currency} />
        <span />
      </div>
      {mode === 'value' ? (
        <ValueForm asset={asset} onDone={() => setMode('view')} />
      ) : (
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => setMode('value')}>
            {tl('Update value')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode('edit')}>
            {tl('Edit')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void deleteAsset(asset.id)}
          >
            {tl('Delete')}
          </button>
        </div>
      )}
    </li>
  );
}

/** Money > Overview: net worth, its parts, the assets you track and the last twelve month ends. */
export function NetWorthCard() {
  const { accounts, data, today } = useMoneyData();
  const assets = useLedger((s) => s.assets);
  const loans = useLedger((s) => s.loans);
  const currency = useLedger((s) => s.settings.currency);
  usePrivacy(); // the history's labels use fmtMoney
  const [adding, setAdding] = useState(false);
  const input = useMemo(
    () => ({ accounts, money: data, assets, loans }),
    [accounts, data, assets, loans],
  );
  const now = useMemo(() => netWorthAt(input, today), [input, today]);
  const history = useMemo(() => netWorthHistory(input, today), [input, today]);
  const empty = netWorthEmpty(input);
  const max = Math.max(1, ...history.map((p) => Math.abs(p.totalMinor)));
  const parts: Array<[string, number, string]> = [
    [tl('Accounts'), now.accountsMinor, 'nw-accounts'],
    [tl('Assets'), now.assetsMinor, 'nw-assets'],
    [tl('Owed to you'), now.owedToYouMinor, 'nw-owed'],
    [tl('Cards owed'), -now.cardsMinor, 'nw-cards'],
    [tl('You owe'), -now.youOweMinor, 'nw-you-owe'],
    [tl('Loans left'), -now.loansMinor, 'nw-loans'],
  ];

  return (
    <section className="card" aria-labelledby="networth-title">
      <div className="card-head">
        <h2 id="networth-title">{tl('Net worth')}</h2>
        {!adding && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            {tl('Add asset')}
          </button>
        )}
      </div>
      {empty && !adding ? (
        <p className="muted small">
          {tl(
            'Add accounts above, loans and udhaar, and assets such as gold, FDs, mutual funds, stocks, PF or property, and Ledger adds up what you own less what you owe. Asset values are the ones you enter; nothing is fetched online.',
          )}
        </p>
      ) : (
        <>
          <p className="big-figure" data-testid="networth-total">
            <Money
              minor={now.totalMinor}
              currency={currency}
              className={now.totalMinor < 0 ? 'status-over' : undefined}
            />
          </p>
          <dl className="networth-parts">
            {parts
              .filter(([, v], i) => v !== 0 || i < 2)
              .map(([label, v, id]) => (
                <div key={id}>
                  <dt>{label}</dt>
                  <dd data-testid={id}>
                    <Money minor={v} currency={currency} signed={v < 0} />
                  </dd>
                </div>
              ))}
          </dl>
        </>
      )}
      {adding && <AssetForm onDone={() => setAdding(false)} />}
      {assets.length > 0 && (
        <>
          <h3 className="networth-sub">{tl('Assets')}</h3>
          <ul className="money-list">
            {assets.map((a) => (
              <AssetRow key={a.id} asset={a} />
            ))}
          </ul>
        </>
      )}
      {history.length > 1 && (
        <>
          <h3 className="networth-sub">{tl('Month ends')}</h3>
          <ul className="networth-history" aria-label={tl('Net worth at each month end')}>
            {history.map((p) => (
              <li
                key={p.month}
                aria-label={`${monthLabel(p.month)}: ${fmtMoney(p.totalMinor, { currency })}`}
              >
                <span className="cashflow-month" aria-hidden="true">
                  {monthShortLabel(p.month)}
                </span>
                <span className="networth-track" aria-hidden="true">
                  <span
                    className={p.totalMinor < 0 ? 'networth-bar networth-neg' : 'networth-bar'}
                    style={{ width: `${(Math.abs(p.totalMinor) / max) * 100}%` }}
                  />
                </span>
                <span className="networth-value" aria-hidden="true">
                  <Money minor={p.totalMinor} currency={currency} compact />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
