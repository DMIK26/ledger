import { normalizeMerchantKey } from './categoriser';
import { subcategoryFits } from './subcategories';
import { normalizeTag } from './tags';
import type { Category, CategoryId, PaymentMethod, Transaction } from './types';
import { tl } from './i18n';

/**
 * Your own rules (Drop 12): "when the merchant contains amazon (and the amount is over 1,000), file it
 * under Shopping and tag it online". They come before what Ledger learned and before built-in words;
 * the first rule that matches wins.
 */

export type RuleMatch = 'contains' | 'starts' | 'is';

export const RULE_MATCH_LABEL: Record<RuleMatch, string> = {
  contains: 'contains',
  get starts() {
    return tl('starts with');
  },
  get is() {
    return tl('is exactly');
  },
};

export interface RuleSet {
  categoryId?: CategoryId;
  subcategoryId?: string;
  tag?: string;
  forWhom?: string;
  taxSection?: string;
}

export interface CustomRule {
  id: string;
  match: RuleMatch;
  text: string;
  /** Inclusive amount limits in minor units. */
  minMinor?: number;
  maxMinor?: number;
  method?: PaymentMethod;
  set: RuleSet;
  createdAt: number;
}

export interface RuleInput {
  merchant: string;
  amountMinor: number;
  method: PaymentMethod;
}

export function ruleMatches(rule: CustomRule, e: RuleInput): boolean {
  const want = normalizeMerchantKey(rule.text);
  const key = normalizeMerchantKey(e.merchant);
  if (!want || !key) return false;
  const textOk =
    rule.match === 'is'
      ? key === want
      : rule.match === 'starts'
        ? key.startsWith(want)
        : key.includes(want);
  if (!textOk) return false;
  if (rule.minMinor !== undefined && e.amountMinor < rule.minMinor) return false;
  if (rule.maxMinor !== undefined && e.amountMinor > rule.maxMinor) return false;
  if (rule.method && e.method !== rule.method) return false;
  return true;
}

export const firstRule = (rules: readonly CustomRule[], e: RuleInput): CustomRule | null =>
  rules.find((r) => ruleMatches(r, e)) ?? null;

type Fields = Pick<
  Transaction,
  'categoryId' | 'subcategoryId' | 'tags' | 'forWhom' | 'taxSection' | 'unsure'
>;

/** Everything a rule sets, applied to an entry (a past one, or a new one from quick add). */
export function applyRule<T extends Fields>(
  tx: T,
  rule: CustomRule,
  categories: readonly Category[],
): T {
  const s = rule.set;
  const out: T = { ...tx };
  if (s.categoryId && categories.some((c) => c.id === s.categoryId)) {
    if (out.categoryId !== s.categoryId) {
      out.categoryId = s.categoryId;
      out.subcategoryId = undefined;
    }
    out.unsure = false;
  }
  if (s.subcategoryId && subcategoryFits(categories, out.categoryId, s.subcategoryId))
    out.subcategoryId = s.subcategoryId;
  if (s.tag && !out.tags.includes(s.tag)) out.tags = [...out.tags, s.tag];
  if (s.forWhom) out.forWhom = s.forWhom;
  if (s.taxSection) out.taxSection = s.taxSection;
  return out;
}

/**
 * What a rule adds to an entry saved from the form, where the category was the person's own choice:
 * the tag, and who it was for and the tax section when those were left empty.
 */
export function ruleExtras<T extends Fields>(tx: T, rule: CustomRule): T {
  const s = rule.set;
  const out: T = { ...tx };
  if (s.tag && !out.tags.includes(s.tag)) out.tags = [...out.tags, s.tag];
  if (s.forWhom && !out.forWhom) out.forWhom = s.forWhom;
  if (s.taxSection && !out.taxSection) out.taxSection = s.taxSection;
  return out;
}

const changed = (a: Fields, b: Fields): boolean =>
  a.categoryId !== b.categoryId ||
  a.subcategoryId !== b.subcategoryId ||
  a.tags.length !== b.tags.length ||
  a.forWhom !== b.forWhom ||
  a.taxSection !== b.taxSection ||
  Boolean(a.unsure) !== Boolean(b.unsure);

export interface RuleTest {
  /** Past entries the rule matches. */
  matches: number;
  /** Those it would change, with what they would become, newest first. */
  changes: Array<{ before: Transaction; after: Transaction }>;
}

/** The rule tried on past entries, before it is saved. */
export function testRule(
  rule: CustomRule,
  transactions: readonly Transaction[],
  categories: readonly Category[],
): RuleTest {
  let matches = 0;
  const changes: RuleTest['changes'] = [];
  for (const t of transactions) {
    if (!ruleMatches(rule, t)) continue;
    matches += 1;
    const after = applyRule(t, rule, categories);
    if (changed(t, after)) changes.push({ before: t, after });
  }
  changes.sort((a, b) => b.before.date.localeCompare(a.before.date));
  return { matches, changes };
}

/** Cleans what the editor produced; returns the problem to show, or null. */
export function ruleProblem(
  rule: Pick<CustomRule, 'text' | 'minMinor' | 'maxMinor' | 'set'>,
): string | null {
  if (!normalizeMerchantKey(rule.text)) return tl('Type what the merchant contains');
  if (rule.minMinor !== undefined && rule.maxMinor !== undefined && rule.minMinor > rule.maxMinor)
    return tl('The lowest amount is above the highest');
  const s = rule.set;
  if (!s.categoryId && !s.subcategoryId && !s.tag && !s.forWhom && !s.taxSection)
    return tl('Choose at least one thing the rule sets');
  return null;
}

/** Tidies the set part: a normalised tag, a trimmed name, nothing empty. */
export function cleanRuleSet(s: RuleSet): RuleSet {
  const out: RuleSet = {};
  if (s.categoryId) out.categoryId = s.categoryId;
  if (s.subcategoryId) out.subcategoryId = s.subcategoryId;
  const tag = s.tag ? normalizeTag(s.tag) : '';
  if (tag) out.tag = tag;
  const who = s.forWhom?.trim().replace(/\s+/g, ' ');
  if (who) out.forWhom = who;
  if (s.taxSection) out.taxSection = s.taxSection;
  return out;
}

/** Moves a rule up (-1) or down (+1) in the list; order decides which rule wins. */
export function moveRule(rules: readonly CustomRule[], id: string, delta: -1 | 1): CustomRule[] {
  const i = rules.findIndex((r) => r.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= rules.length) return [...rules];
  const out = [...rules];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}
