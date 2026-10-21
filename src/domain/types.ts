export type ISODate = string; // 'YYYY-MM-DD', a local calendar date
export type CategoryId = string;

export const PAYMENT_METHODS = ['UPI', 'Cash', 'Card', 'Bank transfer', 'Other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type TxSource = 'form' | 'quick' | 'import' | 'recurring' | 'legacy';

export interface Transaction {
  id: string;
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
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: CategoryId;
  name: string;
  color: string;
  order: number;
  archived?: boolean;
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
}

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
};

export interface AuditEvent {
  id?: number;
  at: number;
  action: 'do' | 'undo' | 'redo';
  label: string;
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
  /** 'YYYY-MM' */
  month: string;
  scope: 'overall' | CategoryId;
  amountMinor: number;
}
