import type { SplitDraft } from '../../data/store';
import type { Person } from '../../domain/udhaar';
import { minorToInput, parseAmountToMinor } from '../../domain/money';
import type { Split, SplitMode, SplitPart } from '../../domain/splits';

/** The split section of the Add and edit form, as the user is filling it in. */
export interface SplitRow {
  key: string;
  /** null is you. */
  personId: string | null;
  /** Typed name for someone not yet in udhaar (empty for you or a known person). */
  name: string;
  /** exact: an amount; percent: a percentage; shares: a whole number; equal: unused. */
  value: string;
  /** For exact amounts, the parsed value in minor units. */
  minor: number | null;
}

export interface SplitState {
  mode: SplitMode;
  /** The key of the row who paid; 'me' is you. */
  paidBy: string;
  rows: SplitRow[];
}

let counter = 0;
export const rowKey = (): string => `r${(counter += 1)}`;

export const ME_KEY = 'me';

export const emptySplit = (): SplitState => ({
  mode: 'equal',
  paidBy: ME_KEY,
  rows: [
    { key: ME_KEY, personId: null, name: '', value: '', minor: null },
    { key: rowKey(), personId: null, name: '', value: '', minor: null },
  ],
});

/** A saved split back into form rows (editing). */
export function splitToState(split: Split, people: readonly Person[]): SplitState {
  const rows = split.parts.map((p): SplitRow => {
    const key = p.personId === null ? ME_KEY : rowKey();
    const value =
      split.mode === 'exact'
        ? minorToInput(p.value)
        : split.mode === 'percent'
          ? minorToInput(p.value).replace(/\.00$/, '')
          : split.mode === 'shares'
            ? String(p.value)
            : '';
    return {
      key,
      personId: p.personId,
      name: p.personId === null ? '' : (people.find((x) => x.id === p.personId)?.name ?? ''),
      value,
      minor: split.mode === 'exact' ? p.value : null,
    };
  });
  const payer = split.paidBy === null ? ME_KEY : rows.find((r) => r.personId === split.paidBy)?.key;
  return { mode: split.mode, paidBy: payer ?? ME_KEY, rows };
}

/** A row's value as the number the split works with. */
export function rowValue(mode: SplitMode, row: SplitRow): number {
  if (mode === 'exact') return row.minor ?? 0;
  if (mode === 'percent') return parseAmountToMinor(row.value.trim() || '0') ?? -1;
  if (mode === 'shares') return /^\d+$/.test(row.value.trim()) ? Number(row.value.trim()) : -1;
  return 0;
}

export const isMe = (row: SplitRow): boolean => row.key === ME_KEY;

/** Rows as parts with a stand-in id each, for working out shares before saving. */
export const previewParts = (state: SplitState): SplitPart[] =>
  state.rows.map((r) => ({ personId: isMe(r) ? null : r.key, value: rowValue(state.mode, r) }));

/** A problem to fix before saving, or null. */
export function splitProblem(state: SplitState): string | null {
  const others = state.rows.filter((r) => !isMe(r));
  if (others.length === 0) return 'Add someone to split with';
  if (others.some((r) => !r.personId && !r.name.trim())) return 'Give everyone in the split a name';
  const names = others.map((r) => r.personId ?? r.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'Someone is in the split twice';
  return null;
}

/** The form's split as the store's draft. */
export function splitDraft(state: SplitState): SplitDraft {
  const person = (r: SplitRow) =>
    isMe(r)
      ? { personId: null }
      : r.personId
        ? { personId: r.personId }
        : { personName: r.name.trim() };
  const payer = state.rows.find((r) => r.key === state.paidBy);
  return {
    mode: state.mode,
    paidBy: !payer || isMe(payer) ? null : person(payer),
    parts: state.rows.map((r) => ({ ...person(r), value: rowValue(state.mode, r) })),
  };
}
