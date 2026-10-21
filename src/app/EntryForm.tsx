import { useEffect, useId, useState, type FormEvent } from 'react';
import { useLedger, type EntryDraft, type ReceiptChange } from '../data/store';
import { categorise } from '../domain/categoriser';
import { fmtDate, parseISO, todayISO } from '../domain/dates';
import { findDuplicate } from '../domain/duplicates';
import { parseQuickEntry } from '../domain/parser';
import { parseTags } from '../domain/tags';
import { PAYMENT_METHODS, type PaymentMethod } from '../domain/types';
import { AmountInput } from './AmountInput';
import { usePrivacy } from './Money';
import { prepareReceipt, useObjectUrl } from './receiptImage';

interface Props {
  /** The entry being edited; omit to add a new one. */
  editing?: { id: string; draft: EntryDraft; hasReceipt?: boolean };
  /** Show the "Describe it" field that fills the form from a quick-add sentence. */
  describe?: boolean;
  autoFocus?: boolean;
  submitLabel: string;
  onDone: () => void;
}

export function EntryForm({
  editing,
  describe = false,
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
  const masked = usePrivacy();

  const start = editing?.draft;
  const [quick, setQuick] = useState('');
  const [merchant, setMerchant] = useState(start?.merchant ?? '');
  const [amount, setAmount] = useState<number | null>(start?.amountMinor ?? null);
  const [amountKey, setAmountKey] = useState(0);
  const [date, setDate] = useState(start?.date ?? todayISO());
  const [categoryId, setCategoryId] = useState(start?.categoryId ?? 'other');
  const [categoryTouched, setCategoryTouched] = useState(editing !== undefined);
  const [method, setMethod] = useState<PaymentMethod>(start?.method ?? lastMethod);
  const [tags, setTags] = useState((start?.tags ?? []).join(', '));
  const [notes, setNotes] = useState(start?.notes ?? '');
  const [receipt, setReceipt] = useState<Blob | null>(null);
  const [receiptChanged, setReceiptChanged] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
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
    const p = parseQuickEntry(text, { today: todayISO(), lastMethod, rules });
    setMerchant(p.merchant);
    setAmount(p.amountMinor);
    setAmountKey((k) => k + 1);
    if (p.errors.length === 0) setDate(p.date);
    setMethod(p.method);
    setCategoryId(p.categoryId);
    setCategoryTouched(false);
    setConfirmDuplicate(false);
  };

  const onMerchant = (value: string) => {
    setMerchant(value);
    setConfirmDuplicate(false);
    if (!categoryTouched) setCategoryId(categorise(value, rules).categoryId);
  };

  const draft = (): EntryDraft => ({
    date,
    amountMinor: amount ?? 0,
    merchant: merchant.trim(),
    categoryId,
    method,
    notes: notes.trim(),
    tags: parseTags(tags),
  });

  const duplicate =
    amount !== null && amount > 0 && parseISO(date)
      ? findDuplicate({ date, amountMinor: amount, merchant }, transactions, editing?.id)
      : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problems: string[] = [];
    if (amount === null || amount <= 0) problems.push('Enter an amount above zero');
    if (!merchant.trim()) problems.push('Say what it was for');
    if (!parseISO(date)) problems.push('Pick a valid date');
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
      <div className="form-grid">
        <div className="field">
          <label htmlFor={f('amount')}>Amount</label>
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
      </div>
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
