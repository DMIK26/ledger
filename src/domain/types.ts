import { tl, type Language } from './i18n';
import type { ForeignAmount } from './fx';
import type { Split } from './splits';
import type { Space, SpaceView } from './spaces';

export type ISODate = string; // 'YYYY-MM-DD', a local calendar date
export type CategoryId = string;

export const PAYMENT_METHODS = ['UPI', 'Cash', 'Card', 'Bank transfer', 'Other'] as const;

/** A payment method as shown, in the interface language; stored values stay English (Drop 13). */
export const methodLabel = (m: string): string => tl(m);

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type TxSource =
  'form' | 'quick' | 'import' | 'recurring' | 'legacy' | 'repeat' | 'keypad' | 'wishlist';

export interface Transaction {
  id: string;
  /** The Shop ledger's rows say 'shop'; missing means Personal (Drop 13). */
  space?: Space;
  date: ISODate;
  /** Integer minor units (paise, cents). Never a float. */
  amountMinor: number;
  currency: string;
  merchant: string;
  categoryId: CategoryId;
  method: PaymentMethod;
  notes: string;
  tags: string[];
  /** The text typed into quick add, kept for re-parsing and audit. */
  raw?: string;
  source: TxSource;
  /** True when the category was a guess the user has not confirmed. */
  unsure?: boolean;
  recurringId?: string;
  /** True when a receipt image is stored under this entry's id in the receipts store. */
  hasReceipt?: boolean;
  /** The account it was paid from, when picked; otherwise the account its method belongs to. */
  accountId?: string;
  /** Paid in another currency: the original amount and the rate typed (amountMinor is in rupees). */
  foreign?: ForeignAmount;
  /** Shared with people (Drop 11): amountMinor is your share; the split has the whole bill. */
  split?: Split;
  /** One of its category's subcategories (Drop 12). Totals still count the entry in categoryId. */
  subcategoryId?: string;
  /** The trip, project or festival fund it belongs to (Drop 12). */
  projectId?: string;
  /** Who it was for, such as a family member or the shop; missing means you (Drop 12). */
  forWhom?: string;
  /** The income-tax deduction it counts towards, such as '80C' (Drop 12, see tax.ts). */
  taxSection?: string;
  /** Warranty in whole months from the entry's date (Drop 12). */
  warrantyMonths?: number;
  createdAt: number;
  updatedAt: number;
}

/** How a category's spending behaves: the same each month, day to day, or now and then. */
export type BudgetKind = 'fixed' | 'flexible' | 'non-monthly';

export interface Category {
  id: CategoryId;
  name: string;
  color: string;
  order: number;
  archived?: boolean;
  /** Missing means the default for the category (see budgetKindOf in plan.ts). */
  budgetKind?: BudgetKind;
  /** What is left of this category's budget, or what went over, carries into next month. */
  rollover?: boolean;
  /** One level of subcategories (Drop 12). */
  subcategories?: Subcategory[];
  /** For the 50/30/20 view; missing means the default (see needOf in needs.ts). */
  need?: 'need' | 'want';
}

/** A subcategory lives inside its category; its id is `${categoryId}/${slug}`. */
export interface Subcategory {
  id: string;
  name: string;
}

export interface MerchantRule {
  /** Normalised merchant key (lowercase, single spaces). */
  key: string;
  categoryId: CategoryId;
  updatedAt: number;
}

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemeChoice;
  privacy: boolean;
  currency: string;
  /** Month the financial year starts in (4 = April). */
  fyStartMonth: number;
  lastMethod: PaymentMethod;
  /** When a backup was last exported (epoch ms, 0 = never). Drives the weekly reminder on phones. */
  lastBackupAt: number;
  /** Full motion, short fades only, or none. The system's reduce-motion setting also counts. */
  motion: 'full' | 'reduced' | 'off';
  /** A tiny vibration when drags snap, where the phone supports it. */
  haptics: boolean;
  /** A soft click when drags snap. Off unless chosen. */
  sounds: boolean;
  /** The pencil, category doodles, mood faces and handwritten annotations. Notes and sketches stay. */
  doodles: boolean;
  /** Hand-drawn outlines on cards and buttons (never in print). */
  sketchStyle: boolean;
  /** Day of the month a month starts on (1 to 28), for people paid on a fixed day. */
  monthStartDay: number;
  /** The missed-day check-in is hidden on this day ("Not now"); '' when it is not hidden. */
  checkinHiddenOn: ISODate | '';
  /** How the Add sheet opens: the full form, the keypad or several lines at once. */
  addMode: AddMode;
  /** Dashboard cards in the order chosen (Drop 11); missing cards take their default place. */
  dashboardOrder: string[];
  /** Dashboard cards hidden with Customise. */
  dashboardHidden: string[];
  /** Transactions columns turned off with Columns. */
  hiddenColumns: string[];
  /** The pencil's wry one-liners, off unless chosen. */
  wryLines: boolean;
  /** Recaps opened or put away, so each is offered once ('month:2026-10'). */
  recapsSeen: string[];
  /** A Shop ledger beside the personal one (Drop 13). */
  spacesOn: boolean;
  shopName: string;
  /** The space the switcher is on; remembered on this device. */
  space: SpaceView;
  /** The folder chosen for weekly backups ('' when none) and when it last got one (Drop 13). */
  folderBackupName: string;
  folderBackupAt: number;
  /** Bills due this week on the app icon, where the device supports it (Drop 13). */
  appBadge: boolean;
  /** The interface language (Drop 13); amounts keep Western digits either way. */
  language: Language;
}

export type AddMode = 'form' | 'keypad' | 'several';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  privacy: false,
  currency: 'INR',
  fyStartMonth: 4,
  lastMethod: 'UPI',
  lastBackupAt: 0,
  motion: 'full',
  haptics: true,
  sounds: false,
  doodles: true,
  sketchStyle: false,
  monthStartDay: 1,
  checkinHiddenOn: '',
  addMode: 'form',
  dashboardOrder: [],
  dashboardHidden: [],
  hiddenColumns: [],
  wryLines: false,
  recapsSeen: [],
  spacesOn: false,
  shopName: 'Shop',
  space: 'personal',
  folderBackupName: '',
  folderBackupAt: 0,
  appBadge: false,
  language: 'en',
};

export interface AuditEvent {
  id?: number;
  at: number;
  action: 'do' | 'undo' | 'redo';
  label: string;
  /** What the step touched, such as 'tx:<id>', for an entry's history (Drop 11 on). */
  entities?: string[];
}

export interface TrashItem {
  id: string;
  tx: Transaction;
  deletedAt: number;
}

/** A lock screen PIN, stored only as a salted PBKDF2 hash. */
export interface LockConfig {
  salt: string;
  hash: string;
  iterations: number;
}

/** A spending limit for one month: the whole month ("overall") or one category. */
export interface Budget {
  /** `${month}|${scope}`, see budgetId(). */
  id: string;
  /** The Shop ledger's rows say 'shop'; missing means Personal (Drop 13). */
  space?: Space;
  /** 'YYYY-MM' */
  month: string;
  scope: 'overall' | CategoryId;
  amountMinor: number;
}
