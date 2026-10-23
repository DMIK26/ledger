import { lazy, Suspense, useEffect, useId, useState, type FormEvent } from 'react';
import { useLedger, type EntryDraft, type ReceiptChange } from '../data/store';
import { categorise } from '../domain/categoriser';
import { fmtDate, parseISO, todayISO } from '../domain/dates';
import { findDuplicate } from '../domain/duplicates';
import { parseQuickEntry } from '../domain/parser';
import { parseTags } from '../domain/tags';
import { PAYMENT_METHODS, type PaymentMethod } from '../domain/types';
import { AmountInput } from './AmountInput';
import { accountForMethod } from '../domain/accounts';
import { convertMinor, FX_CURRENCIES, parseRate, rateAsMinor, rateInput } from '../domain/fx';
import { fmtMoney } from '../domain/money';
import { usePrivacy } from './Money';
import { prepareReceipt, useObjectUrl } from './receiptImage';
import { myShare, shareAmounts, type Split } from '../domain/splits';
import type { AuditEvent } from '../domain/types';
import { fmtTime } from '../domain/dates';
import { projectForDate } from '../domain/projects';
import { forWhomNames } from '../domain/forWhom';
import { firstRule } from '../domain/rules';
import { subcategoriesOf } from '../domain/subcategories';
import { TAX_SECTIONS } from '../domain/tax';
import { MAX_WARRANTY_MONTHS } from '../domain/warranties';
import {
  emptySplit,
  previewParts,
  splitDraft,
  splitProblem,
  splitToState,
  type SplitState,
} from './split/splitForm';

// The split section loads the first time someone splits an expense.
const SplitEditor = lazy(() =>
  import('./split/SplitEditor').then((m) => ({ default: m.SplitEditor })),
);

/** What the activity log holds about this entry (Drop 11), loaded when opened. */
function EntryHistory({ id }: { id: string }) {
  const getEntryHistory = useLedger((s) => s.getEntryHistory);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const word = { do: '', undo: 'Undone: ', redo: 'Redone: ' } as const;
  return (
    <details className="entry-history">
      <summary
        onClick={() => {
          if (events === null) void getEntryHistory(id).then(setEvents);
        }}
      >
        History
      </summary>
      {events === null ? null : events.length === 0 ? (
        <p className="muted small">Nothing recorded yet. The log keeps the last 500 steps.</p>
      ) : (
        <ul className="history-list" data-testid="entry-history">
          {events.map((e) => (
            <li key={e.id ?? e.at}>
              <span className="muted small">
                {fmtDate(todayISO(new Date(e.at)))} {fmtTime(e.at)}
              </span>{' '}
              {word[e.action]}
              {e.label}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** The date a new entry starts on: the one being edited, the one asked for, or today. */
const date0 = (editing?: string, initial?: string): string =>
  editing ?? (initial && parseISO(initial) ? initial : todayISO());

interface Props {
  /** The entry being edited; omit to add a new one. */
  editing?: { id: string; draft: EntryDraft; hasReceipt?: boolean; split?: Split };
  /** Show the "Describe it" field that fills the form from a quick-add sentence. */
  describe?: boolean;
  /** A new entry's starting date (the check-in opens Add for a missed day). */
  initialDate?: string;
  autoFocus?: boolean;
  submitLabel: string;
  onDone: () => void;
}

export function EntryForm({
  editing,
  describe = false,
  initialDate,
  autoFocus = false,
  submitLabel,
  onDone,
}: Props) {
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  const categories = useLedger((s) => s.categories);
  const rules = useLedger((s) => s.rules);
  const transactions = useLedger((s) => s.transactions);
  const lastMethod = useLedger((s) => s.settings.lastMethod);
  const addEntry = useLedger((s) => s.addEntry);
  const editTransaction = useLedger((s) => s.editTransaction);
  const getReceipt = useLedger((s) => s.getReceipt);
  const people = useLedger((s) => s.people);
  const customRules = useLedger((s) => s.customRules);
  const projects = useLedger((s) => s.projects);
  const masked = usePrivacy();

  const start = editing?.draft;
  const [quick, setQuick] = useState('');
  const [merchant, setMerchant] = useState(start?.merchant ?? '');
  const [amount, setAmount] = useState<number | null>(start?.amountMinor ?? null);
  const [amountKey, setAmountKey] = useState(0);
  const [date, setDate] = useState(date0(start?.date, initialDate));
  const [categoryId, setCategoryId] = useState(start?.categoryId ?? 'other');
  const [subcategoryId, setSubcategoryId] = useState(start?.subcategoryId ?? '');
  const autoProject = (d: string) => projectForDate(projects, d)?.id ?? '';
  const [projectId, setProjectId] = useState(() =>
    editing ? (start?.projectId ?? '') : autoProject(date0(start?.date, initialDate)),
  );
  const [projectTouched, setProjectTouched] = useState(editing !== undefined);
  const [forWhom, setForWhom] = useState(start?.forWhom ?? '');
  const [taxSection, setTaxSection] = useState(start?.taxSection ?? '');
  const [warranty, setWarranty] = useState(
    start?.warrantyMonths ? String(start.warrantyMonths) : '',
  );
  // Open from the start when editing an entry that uses these; never closed under someone typing.
  const [moreOpen] = useState(
    Boolean(start?.forWhom || start?.taxSection || start?.warrantyMonths),
  );
  const [categoryTouched, setCategoryTouched] = useState(editing !== undefined);
  const [method, setMethod] = useState<PaymentMethod>(start?.method ?? lastMethod);
  const [tags, setTags] = useState((start?.tags ?? []).join(', '));
  const accounts = useLedger((s) => s.accounts);
  const currency = useLedger((s) => s.settings.currency);
  const [accountId, setAccountId] = useState(start?.accountId ?? '');
  const [foreignOn, setForeignOn] = useState(Boolean(start?.foreign));
  const [fxCurrency, setFxCurrency] = useState<string>(start?.foreign?.currency ?? 'USD');
  const [fxAmount, setFxAmount] = useState<number | null>(start?.foreign?.amountMinor ?? null);
  const [fxRate, setFxRate] = useState(start?.foreign ? rateInput(start.foreign.rate4) : '');
  const rate4 = parseRate(fxRate);
  // In another currency the rupee amount is worked out from the amount and the rate typed.
  const effective = foreignOn
    ? fxAmount !== null && rate4 !== null
      ? convertMinor(fxAmount, rate4)
      : null
    : amount;
  const openAccounts = accounts.filter((a) => !a.archived || a.id === accountId);
  const methodAccount = accountForMethod(accounts, method);
  const [notes, setNotes] = useState(start?.notes ?? '');
  const [receipt, setReceipt] = useState<Blob | null>(null);
  const [receiptChanged, setReceiptChanged] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [splitOn, setSplitOn] = useState(Boolean(editing?.split));
  const [split, setSplit] = useState<SplitState>(() =>
    editing?.split ? splitToState(editing.split, people) : emptySplit(),
  );
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const receiptUrl = useObjectUrl(receipt);

  useEffect(() => {
    if (!editing?.hasReceipt) return;
    let live = true;
    void getReceipt(editing.id).then((blob) => {
      if (live && blob) setReceipt(blob);
    });
    return () => {
      live = false;
    };
  }, [editing?.id, editing?.hasReceipt, getReceipt]);

  const fillFromQuick = (text: string) => {
    setQuick(text);
    if (!text.trim()) return;
    const p = parseQuickEntry(text, {
      today: todayISO(),
      lastMethod,
      rules,
      customRules,
      categories,
    });
    setMerchant(p.merchant);
    setAmount(p.amountMinor);
    setAmountKey((k) => k + 1);
    if (p.errors.length === 0) setDate(p.date);
    setMethod(p.method);
    setCategoryId(p.categoryId);
    setSubcategoryId(p.subcategoryId ?? '');
    setCategoryTouched(false);
    if (p.errors.length === 0 && !projectTouched) setProjectId(autoProject(p.date));
    setConfirmDuplicate(false);
  };

  const onMerchant = (value: string) => {
    setMerchant(value);
    setConfirmDuplicate(false);
    if (categoryTouched) return;
    // Your rules first, then what Ledger learned and its built-in words (Drop 12).
    const rule = firstRule(customRules, { merchant: value, amountMinor: effective ?? 0, method });
    setCategoryId(rule?.set.categoryId ?? categorise(value, rules).categoryId);
    setSubcategoryId(rule?.set.categoryId ? (rule.set.subcategoryId ?? '') : '');
  };

  const draft = (): EntryDraft => ({
    date,
    amountMinor: effective ?? 0,
    merchant: merchant.trim(),
    categoryId,
    method,
    notes: notes.trim(),
    tags: parseTags(tags),
    accountId: accountId || undefined,
    foreign:
      foreignOn && fxAmount !== null && rate4 !== null
        ? { currency: fxCurrency, amountMinor: fxAmount, rate4 }
        : undefined,
    // A split sends the whole bill and the people; turning one off on an edit removes it.
    ...(splitOn ? { split: splitDraft(split) } : editing?.split ? { split: null } : {}),
    subcategoryId: subcategoryId || undefined,
    projectId: projectId || null,
    forWhom: forWhom.trim().replace(/\s+/g, ' ') || undefined,
    taxSection: taxSection || undefined,
    warrantyMonths: warranty ? Number(warranty) : undefined,
  });
  const subs = subcategoriesOf(categories, categoryId);
  const openProjects = projects.filter((p) => !p.archived || p.id === projectId);
  const names = [...new Set([...forWhomNames(transactions), ...people.map((p) => p.name), 'Shop'])];

  const duplicate =
    effective !== null && effective > 0 && parseISO(date)
      ? findDuplicate({ date, amountMinor: effective, merchant }, transactions, editing?.id)
      : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problems: string[] = [];
    if (foreignOn && rate4 === null) problems.push('Enter the rate, rupees for one unit');
    else if (effective === null || effective <= 0) problems.push('Enter an amount above zero');
    if (!merchant.trim()) problems.push('Say what it was for');
    if (!parseISO(date)) problems.push('Pick a valid date');
    if (
      warranty &&
      !(/^\d+$/.test(warranty) && Number(warranty) >= 1 && Number(warranty) <= MAX_WARRANTY_MONTHS)
    )
      problems.push(`Warranty is in whole months, 1 to ${MAX_WARRANTY_MONTHS}`);
    if (splitOn && effective !== null && effective > 0) {
      const problem = splitProblem(split);
      const shares = shareAmounts(effective, split.mode, previewParts(split));
      if (problem) problems.push(problem);
      else if (!shares.ok) problems.push(shares.error);
      else if (
        myShare({
          parts: previewParts(split).map((p, i) => ({ ...p, shareMinor: shares.shares[i]! })),
        }) <= 0
      )
        problems.push('Your share is zero; record lending in Udhaar instead');
    }
    setErrors(problems);
    if (problems.length > 0 || saving) return;
    if (duplicate && !confirmDuplicate) {
      setConfirmDuplicate(true);
      return;
    }
    setSaving(true);
    try {
      const change: ReceiptChange = receiptChanged ? receipt : undefined;
      if (editing) await editTransaction(editing.id, draft(), change);
      else await addEntry(draft(), receipt);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const onReceipt = async (file: File | undefined) => {
    setReceiptError(null);
    if (!file) return;
    try {
      setReceipt(await prepareReceipt(file));
      setReceiptChanged(true);
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : 'Could not read that image.');
    }
  };

  return (
    <form className="entry-form" onSubmit={(e) => void submit(e)} noValidate>
      {describe && (
        <div className="field">
          <label htmlFor={f('quick')}>Describe it</label>
          <input
            id={f('quick')}
            className="input"
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="shawarma 500 on 18th upi"
            autoFocus={autoFocus}
            value={quick}
            onChange={(e) => fillFromQuick(e.target.value)}
          />
          <p className="muted small">Fills in the fields below. Adjust anything before saving.</p>
        </div>
      )}
      <label className="check foreign-toggle">
        <input
          type="checkbox"
          checked={foreignOn}
          onChange={(e) => {
            setForeignOn(e.target.checked);
            setConfirmDuplicate(false);
          }}
        />
        Paid in another currency
      </label>
      <label className="check foreign-toggle">
        <input type="checkbox" checked={splitOn} onChange={(e) => setSplitOn(e.target.checked)} />
        Split with others
      </label>
      <div className="form-grid">
        {foreignOn ? (
          <>
            <div className="field">
              <label htmlFor={f('fx-currency')}>Currency</label>
              <select
                id={f('fx-currency')}
                className="select input"
                value={fxCurrency}
                onChange={(e) => setFxCurrency(e.target.value)}
              >
                {FX_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={f('fx-amount')}>Amount in {fxCurrency}</label>
              <AmountInput id={f('fx-amount')} initialMinor={fxAmount} onChange={setFxAmount} />
            </div>
            <div className="field">
              <label htmlFor={f('fx-rate')}>Rate, rupees for 1 {fxCurrency}</label>
              <input
                id={f('fx-rate')}
                className="input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="83.25"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
              />
              {effective !== null && rate4 !== null && (
                <span className="amt-sum small" aria-live="polite" data-testid="fx-result">
                  = {fmtMoney(effective, { currency })} at{' '}
                  {fmtMoney(rateAsMinor(rate4), { currency })}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="field">
            <label htmlFor={f('amount')}>{splitOn ? 'Whole bill' : 'Amount'}</label>
            <AmountInput
              key={amountKey}
              id={f('amount')}
              initialMinor={amount}
              onChange={(v) => {
                setAmount(v);
                setConfirmDuplicate(false);
              }}
              invalid={errors.length > 0 && (amount === null || amount <= 0)}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor={f('merchant')}>What for</label>
          <input
            id={f('merchant')}
            className="input"
            type="text"
            autoComplete="off"
            autoFocus={autoFocus && !describe}
            value={merchant}
            onChange={(e) => onMerchant(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={f('date')}>Date</label>
          <input
            id={f('date')}
            className="input"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setConfirmDuplicate(false);
              if (!projectTouched && parseISO(e.target.value))
                setProjectId(autoProject(e.target.value));
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={f('category')}>Category</label>
          <select
            id={f('category')}
            className="select input"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setSubcategoryId('');
              setCategoryTouched(true);
            }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {subs.length > 0 && (
          <div className="field">
            <label htmlFor={f('sub')}>Subcategory</label>
            <select
              id={f('sub')}
              className="select input"
              value={subcategoryId}
              onChange={(e) => setSubcategoryId(e.target.value)}
            >
              <option value="">None</option>
              {subs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor={f('method')}>Paid by</label>
          <select
            id={f('method')}
            className="select input"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        {openAccounts.length > 0 && (
          <div className="field">
            <label htmlFor={f('account')}>From account</label>
            <select
              id={f('account')}
              className="select input"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">
                {methodAccount ? `${methodAccount.name} (${method})` : `No account for ${method}`}
              </option>
              {openAccounts
                .filter((a) => a.id !== methodAccount?.id || accountId === a.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor={f('tags')}>Tags</label>
          <input
            id={f('tags')}
            className="input"
            type="text"
            autoComplete="off"
            placeholder="work, trip"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        {openProjects.length > 0 && (
          <div className="field">
            <label htmlFor={f('project')}>Trip or project</label>
            <select
              id={f('project')}
              className="select input"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setProjectTouched(true);
              }}
            >
              <option value="">None</option>
              {openProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <details className="more-details" open={moreOpen}>
        <summary>Who it was for, tax and warranty</summary>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={f('for')}>For</label>
            <input
              id={f('for')}
              className="input"
              type="text"
              autoComplete="off"
              list={f('for-names')}
              placeholder="You"
              value={forWhom}
              onChange={(e) => setForWhom(e.target.value)}
            />
            <datalist id={f('for-names')}>
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor={f('tax')}>Tax deduction</label>
            <select
              id={f('tax')}
              className="select input"
              value={taxSection}
              onChange={(e) => setTaxSection(e.target.value)}
            >
              <option value="">None</option>
              {TAX_SECTIONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id === 'Other' ? 'Other deduction' : `${x.id}, ${x.what}`}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={f('warranty')}>Warranty, months</label>
            <input
              id={f('warranty')}
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="12"
              value={warranty}
              onChange={(e) => setWarranty(e.target.value.trim())}
            />
          </div>
        </div>
        {warranty && !receipt && (
          <p className="muted small">
            Add a photo of the receipt below to keep it for the warranty.
          </p>
        )}
      </details>
      {splitOn && (
        <Suspense fallback={<p className="muted small">Opening the split…</p>}>
          <SplitEditor totalMinor={effective} state={split} onChange={setSplit} />
        </Suspense>
      )}
      <div className="field">
        <label htmlFor={f('notes')}>Notes</label>
        <textarea
          id={f('notes')}
          className="input textarea"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="receipt-field">
        {receiptUrl && (
          <img
            className="receipt-thumb"
            src={receiptUrl}
            alt="Receipt"
            data-masked={masked ? '' : undefined}
          />
        )}
        <label className="btn">
          {receipt ? 'Replace receipt' : 'Add receipt'}
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(e) => {
              void onReceipt(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {receipt && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setReceipt(null);
              setReceiptChanged(true);
            }}
          >
            Remove receipt
          </button>
        )}
      </div>
      {(errors.length > 0 || receiptError) && (
        <ul className="errors" role="alert">
          {[...errors, ...(receiptError ? [receiptError] : [])].map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {duplicate && confirmDuplicate && (
        <p className="warning" role="alert">
          This looks like a repeat of {duplicate.merchant} on {fmtDate(duplicate.date)}. Save again
          to keep both.
        </p>
      )}
      {editing && <EntryHistory id={editing.id} />}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {duplicate && confirmDuplicate ? 'Save anyway' : submitLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
