import { useState, type FormEvent } from 'react';
import { newId, useLedger } from '../../data/store';
import { categoryById } from '../../domain/categories';
import { fmtDate } from '../../domain/dates';
import {
  cleanRuleSet,
  RULE_MATCH_LABEL,
  ruleProblem,
  testRule,
  type CustomRule,
  type RuleMatch,
} from '../../domain/rules';
import { subcategoriesOf, subcategoryName } from '../../domain/subcategories';
import { TAX_SECTIONS } from '../../domain/tax';
import { methodLabel, PAYMENT_METHODS, type PaymentMethod } from '../../domain/types';
import { AmountInput } from '../AmountInput';
import { Money } from '../Money';
import { tl } from '../../domain/i18n';
import { tr } from '../tr';

const EXAMPLES = 5;

/** One rule in words: "Merchant contains “amazon”, ₹1,000 or more: Shopping & Essentials, tag online". */
function RuleText({ rule }: { rule: CustomRule }) {
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const s = rule.set;
  const then = [
    s.categoryId ? (categoryById(categories, s.categoryId)?.name ?? tl('Other')) : '',
    s.subcategoryId && s.categoryId
      ? (subcategoryName(categories, {
          categoryId: s.categoryId,
          subcategoryId: s.subcategoryId,
        }) ?? '')
      : '',
    s.tag ? tl('tag {0}', s.tag) : '',
    s.forWhom ? tl('for {0}', s.forWhom) : '',
    s.taxSection ? tl('tax {0}', s.taxSection) : '',
  ].filter(Boolean);
  return (
    <span>
      {tr(
        'Merchant {0} “{1}”{2}{3}{4}: {5}',
        RULE_MATCH_LABEL[rule.match],
        rule.text,
        rule.minMinor !== undefined && (
          <>{tr(', {0} or more', <Money minor={rule.minMinor} currency={currency} />)}</>
        ),
        rule.maxMinor !== undefined && (
          <>{tr(', up to {0}', <Money minor={rule.maxMinor} currency={currency} />)}</>
        ),
        rule.method ? tl(', paid by {0}', rule.method) : '',
        then.join(', '),
      )}
    </span>
  );
}

function RuleEditor({
  initial,
  startText,
  onDone,
}: {
  initial?: CustomRule;
  startText?: string;
  onDone: () => void;
}) {
  const transactions = useLedger((s) => s.transactions);
  const categories = useLedger((s) => s.categories);
  const saveCustomRule = useLedger((s) => s.saveCustomRule);
  const [match, setMatch] = useState<RuleMatch>(initial?.match ?? 'contains');
  const [text, setText] = useState(initial?.text ?? startText ?? '');
  const [minMinor, setMin] = useState<number | null>(initial?.minMinor ?? null);
  const [maxMinor, setMax] = useState<number | null>(initial?.maxMinor ?? null);
  const [method, setMethod] = useState<PaymentMethod | ''>(initial?.method ?? '');
  const [categoryId, setCategoryId] = useState(initial?.set.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(initial?.set.subcategoryId ?? '');
  const [tag, setTag] = useState(initial?.set.tag ?? '');
  const [forWhom, setForWhom] = useState(initial?.set.forWhom ?? '');
  const [taxSection, setTaxSection] = useState(initial?.set.taxSection ?? '');
  const [applyPast, setApplyPast] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rule: CustomRule = {
    id: initial?.id ?? 'draft',
    match,
    text: text.trim(),
    ...(minMinor !== null ? { minMinor } : {}),
    ...(maxMinor !== null ? { maxMinor } : {}),
    ...(method ? { method } : {}),
    set: cleanRuleSet({ categoryId, subcategoryId, tag, forWhom, taxSection }),
    createdAt: initial?.createdAt ?? 0,
  };
  const problem = ruleProblem(rule);
  const test = problem ? null : testRule(rule, transactions, categories);
  const subs = categoryId ? subcategoriesOf(categories, categoryId) : [];
  const name = (id: string) => categoryById(categories, id)?.name ?? tl('Other');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem) return setError(problem);
    const saved: CustomRule = {
      ...rule,
      id: initial?.id ?? newId(),
    };
    const changes = applyPast && test ? test.changes.map((c) => c.before.id) : [];
    await saveCustomRule(saved, changes);
    onDone();
  };

  return (
    <form className="entry-form rule-form" onSubmit={(e) => void submit(e)} noValidate>
      <fieldset className="facet">
        <legend>{tl('When')}</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rule-match">{tl('The merchant')}</label>
            <select
              id="rule-match"
              className="select input"
              value={match}
              onChange={(e) => setMatch(e.target.value as RuleMatch)}
            >
              {(Object.keys(RULE_MATCH_LABEL) as RuleMatch[]).map((m) => (
                <option key={m} value={m}>
                  {RULE_MATCH_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rule-text">{tl('These words')}</label>
            <input
              id="rule-text"
              className="input"
              autoComplete="off"
              placeholder={tl('amazon')}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rule-min">{tl('Amount at least (optional)')}</label>
            <AmountInput id="rule-min" initialMinor={initial?.minMinor ?? null} onChange={setMin} />
          </div>
          <div className="field">
            <label htmlFor="rule-max">{tl('Amount at most (optional)')}</label>
            <AmountInput id="rule-max" initialMinor={initial?.maxMinor ?? null} onChange={setMax} />
          </div>
          <div className="field">
            <label htmlFor="rule-method">{tl('Paid by')}</label>
            <select
              id="rule-method"
              className="select input"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}
            >
              <option value="">{tl('Any method')}</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>
      <fieldset className="facet">
        <legend>{tl('Then')}</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rule-category">{tl('Category')}</label>
            <select
              id="rule-category"
              className="select input"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSubcategoryId('');
              }}
            >
              <option value="">{tl('Leave it as it is')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {subs.length > 0 && (
            <div className="field">
              <label htmlFor="rule-sub">{tl('Subcategory')}</label>
              <select
                id="rule-sub"
                className="select input"
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
              >
                <option value="">{tl('None')}</option>
                {subs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="rule-tag">{tl('Add a tag')}</label>
            <input
              id="rule-tag"
              className="input"
              autoComplete="off"
              placeholder={tl('online')}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rule-for">{tl('For')}</label>
            <input
              id="rule-for"
              className="input"
              autoComplete="off"
              placeholder={tl('Shop')}
              value={forWhom}
              onChange={(e) => setForWhom(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rule-tax">{tl('Tax deduction')}</label>
            <select
              id="rule-tax"
              className="select input"
              value={taxSection}
              onChange={(e) => setTaxSection(e.target.value)}
            >
              <option value="">{tl('None')}</option>
              {TAX_SECTIONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id === 'Other' ? tl('Other deduction') : x.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>
      <div className="rule-test" aria-live="polite" data-testid="rule-test">
        {test === null ? (
          <p className="muted small">{problem}</p>
        ) : (
          <>
            <p className="small">
              {test.matches === 0
                ? tl('Matches no past entries yet; it will apply to new ones.')
                : tl(
                    'Matches {0}; {1}',
                    test.matches === 1 ? tl('1 past entry') : tl('{0} past entries', test.matches),
                    test.changes.length === 0
                      ? tl('none would change.')
                      : tl('{0} would change.', test.changes.length),
                  )}
            </p>
            {test.changes.length > 0 && (
              <>
                <ul className="rule-examples">
                  {test.changes.slice(0, EXAMPLES).map(({ before, after }) => (
                    <li key={before.id} className="small">
                      {before.merchant}, {fmtDate(before.date)}: {name(before.categoryId)}
                      {after.categoryId !== before.categoryId
                        ? ' ' + tl('to {0}', name(after.categoryId))
                        : ''}
                      {after.tags.length > before.tags.length ? tl(', tag {0}', rule.set.tag) : ''}
                      {after.forWhom !== before.forWhom ? tl(', for {0}', after.forWhom) : ''}
                      {after.taxSection !== before.taxSection
                        ? tl(', tax {0}', after.taxSection)
                        : ''}
                    </li>
                  ))}
                  {test.changes.length > EXAMPLES && (
                    <li className="muted small">
                      {tl('and {0} more', test.changes.length - EXAMPLES)}
                    </li>
                  )}
                </ul>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={applyPast}
                    onChange={(e) => setApplyPast(e.target.checked)}
                  />
                  {tl(
                    'Also change those {0}',
                    test.changes.length === 1 ? tl('entry') : tl('entries'),
                  )}
                </label>
              </>
            )}
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
          {tl('Save rule')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {tl('Cancel')}
        </button>
      </div>
    </form>
  );
}

/**
 * Settings > Rules (Drop 12): your own rules, tried top to bottom before what Ledger learned. Each is
 * tested on past entries while you write it, and can change them when saved (one undo).
 */
export function RulesCard({ startText }: { startText?: string | null }) {
  const rules = useLedger((s) => s.customRules);
  const deleteCustomRule = useLedger((s) => s.deleteCustomRule);
  const moveCustomRule = useLedger((s) => s.moveCustomRule);
  const [editing, setEditing] = useState<string | 'new' | null>(startText ? 'new' : null);
  return (
    <section className="card" aria-labelledby="custom-rules-title">
      <div className="card-head">
        <h2 id="custom-rules-title">{tl('Your rules')}</h2>
        {editing === null && (
          <button type="button" className="btn" onClick={() => setEditing('new')}>
            {tl('Add a rule')}
          </button>
        )}
      </div>
      <p className="muted small">
        {tl(
          'Your rules come first, top to bottom; the first that matches wins. Then come the categories Ledger learned, then its built-in words.',
        )}
      </p>
      {editing === 'new' && (
        <RuleEditor startText={startText ?? undefined} onDone={() => setEditing(null)} />
      )}
      {rules.length > 0 && (
        <ol className="rule-list">
          {rules.map((r, i) =>
            editing === r.id ? (
              <li key={r.id}>
                <RuleEditor initial={r} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={r.id} className="rule-row custom-rule" data-testid="custom-rule">
                <RuleText rule={r} />
                <span className="btn-row">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={i === 0}
                    aria-label={tl('Move the rule for {0} up', r.text)}
                    onClick={() => void moveCustomRule(r.id, -1)}
                  >
                    {tl('Up')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={i === rules.length - 1}
                    aria-label={tl('Move the rule for {0} down', r.text)}
                    onClick={() => void moveCustomRule(r.id, 1)}
                  >
                    {tl('Down')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={tl('Edit the rule for {0}', r.text)}
                    onClick={() => setEditing(r.id)}
                  >
                    {tl('Edit')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={tl('Delete the rule for {0}', r.text)}
                    onClick={() => void deleteCustomRule(r.id)}
                  >
                    {tl('Delete')}
                  </button>
                </span>
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
}
