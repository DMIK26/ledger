import { OTHER_ID } from './categories';
import { INDIC_KEYWORDS_NFC } from './indic';
import type { CategoryId } from './types';

export type Confidence = 'rule' | 'keyword' | 'fuzzy' | 'none';

/** Built-in keywords, written for everyday Indian usage. Learned rules always win over these. */
const KEYWORDS: Record<string, string[]> = {
  entertainment: [
    'film', 'movie', 'cinema', 'pvr', 'inox', 'bookmyshow', 'netflix', 'hotstar', 'spotify',
    'youtube', 'prime video', 'gaming', 'game', 'steam', 'concert', 'show', 'party', 'club',
    'pub', 'ott', 'theatre', 'museum', 'amusement', 'bowling',
  ],
  food: [
    'shawarma', 'biryani', 'biriyani', 'pizza', 'burger', 'sandwich', 'momos', 'dosa', 'idli',
    'vada', 'paratha', 'thali', 'meal', 'lunch', 'dinner', 'breakfast', 'brunch', 'snack',
    'chai', 'tea', 'coffee', 'juice', 'lassi', 'shake', 'icecream', 'ice cream', 'dessert',
    'bakery', 'cake', 'restaurant', 'cafe', 'canteen', 'mess', 'dhaba', 'swiggy', 'zomato',
    'eatsure', 'dominos', 'kfc', 'mcdonalds', 'starbucks', 'subway', 'tiffin', 'food', 'dining',
  ],
  groceries: [
    'blinkit', 'zepto', 'bigbasket', 'dmart', 'instamart', 'jiomart', 'kirana', 'vegetables',
    'veggies', 'fruits', 'grocery', 'groceries', 'milk', 'curd', 'eggs', 'rice', 'atta', 'dal',
    'supermarket', 'provisions',
  ],
  transport: [
    'uber', 'ola', 'rapido', 'auto', 'rickshaw', 'cab', 'taxi', 'bus', 'metro', 'train', 'irctc',
    'flight', 'airline', 'indigo', 'redbus', 'petrol', 'diesel', 'fuel', 'cng', 'parking', 'toll',
    'fastag', 'ride', 'travel', 'hotel', 'ticket',
  ],
  housing: [
    'rent', 'electricity', 'electric', 'water', 'wifi', 'broadband', 'internet', 'gas', 'cylinder',
    'lpg', 'recharge', 'jio', 'airtel', 'bsnl', 'dth', 'maintenance', 'society', 'bill', 'utilities',
    'utility', 'plumber', 'electrician',
  ],
  shopping: [
    'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'clothes', 'clothing', 'shirt',
    'jeans', 'shoes', 'footwear', 'bag', 'watch', 'electronics', 'charger', 'headphones',
    'earphones', 'gift', 'mall', 'shopping', 'store', 'stationery', 'essentials', 'decathlon', 'ikea',
  ],
  health: [
    'pharmacy', 'medicine', 'medical', 'doctor', 'hospital', 'clinic', 'dentist', 'lab', 'apollo',
    'medplus', 'pharmeasy', 'netmeds', 'tablet', 'gym', 'fitness', 'yoga', 'checkup', 'optical',
    'spectacles',
  ],
  education: [
    'fees', 'fee', 'tuition', 'college', 'school', 'course', 'udemy', 'coursera', 'book', 'books',
    'exam', 'library', 'coaching', 'journal', 'printout', 'xerox', 'certification',
  ],
  business: [
    'supplies', 'freight', 'office', 'inventory', 'stock', 'wholesale', 'vendor', 'invoice',
    'courier', 'packaging', 'godown', 'warehouse', 'loading', 'unloading',
  ],
};

/** Ties are broken in this order. */
const PRIORITY = [
  'entertainment', 'food', 'groceries', 'transport', 'housing', 'shopping', 'health', 'education',
  'business',
];

/**
 * Lowercase words of a-z, 0-9, Devanagari and Telugu (Hindi and Telugu merchants keep their script);
 * everything else becomes a space. Latin keys are unchanged from 1.0, so learned rules still match.
 */
export function normalizeMerchantKey(merchant: string): string {
  return merchant
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9\s'\p{Script=Devanagari}\p{Script=Telugu}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const keywordsFor = (id: string): string[] => [
  ...(KEYWORDS[id] ?? []),
  ...(INDIC_KEYWORDS_NFC[id] ?? []),
];

function tokens(key: string): string[] {
  return key.split(' ').filter(Boolean);
}

/** True when a and b differ by at most one insertion, deletion or substitution. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

export interface Categorised {
  categoryId: CategoryId;
  confidence: Confidence;
}

/**
 * Order of trust: learned rules, built-in keywords, typo-tolerant keywords, then "Other" (unsure).
 * It never falls back to Food & Dining.
 */
export function categorise(merchant: string, rules: Record<string, CategoryId> = {}): Categorised {
  const key = normalizeMerchantKey(merchant);
  if (!key) return { categoryId: OTHER_ID, confidence: 'none' };
  const words = tokens(key);

  const exact = rules[key];
  if (exact) return { categoryId: exact, confidence: 'rule' };
  for (const w of words) {
    const byWord = rules[w];
    if (byWord) return { categoryId: byWord, confidence: 'rule' };
  }

  let best: { id: string; score: number } | null = null;
  for (const id of PRIORITY) {
    let score = 0;
    for (const k of keywordsFor(id)) {
      if (k.includes(' ')) {
        if (` ${key} `.includes(` ${k} `)) score += 2;
      } else if (words.some((w) => w === k || w === `${k}s` || w === `${k}es`)) score += 2;
    }
    if (score > 0 && (!best || score > best.score)) best = { id, score };
  }
  if (best) return { categoryId: best.id, confidence: 'keyword' };

  for (const w of words) {
    if (w.length < 5) continue;
    for (const id of PRIORITY) {
      for (const k of keywordsFor(id)) {
        if (k.length >= 5 && !k.includes(' ') && withinOneEdit(w, k)) {
          return { categoryId: id, confidence: 'fuzzy' };
        }
      }
    }
  }
  return { categoryId: OTHER_ID, confidence: 'none' };
}
