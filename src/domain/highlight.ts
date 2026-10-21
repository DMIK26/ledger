import { normalizeMerchantKey } from './categoriser';
import type { ParsedEntry, TokenKind } from './parser';

export type HighlightKind = TokenKind | 'category';
export interface Segment {
  text: string;
  kind: HighlightKind | null;
}

/**
 * Splits the typed text into plain and recognised runs for the quick-add highlighter: amount, date and
 * method come from the parser's token spans; merchant words count as "category" when the category was
 * recognised (not a guess). Returns the text as one plain run when spans cannot be trusted.
 */
export function highlightSegments(
  parsed: Pick<ParsedEntry, 'raw' | 'text' | 'tokens' | 'merchant' | 'confidence'>,
): Segment[] {
  const { raw } = parsed;
  if (parsed.text !== raw) return raw ? [{ text: raw, kind: null }] : [];
  const kinds: Array<HighlightKind | null> = new Array<HighlightKind | null>(raw.length).fill(null);
  for (const t of parsed.tokens) {
    for (let i = Math.max(0, t.start); i < Math.min(raw.length, t.end); i += 1) kinds[i] = t.kind;
  }
  if (parsed.confidence !== 'none') {
    const words = new Set(normalizeMerchantKey(parsed.merchant).split(' ').filter(Boolean));
    const re = /[\p{L}\p{N}']+/gu;
    for (let m = re.exec(raw); m; m = re.exec(raw)) {
      const start = m.index;
      const end = start + m[0].length;
      if (kinds.slice(start, end).some((k) => k !== null)) continue;
      if (words.has(normalizeMerchantKey(m[0])))
        for (let i = start; i < end; i += 1) kinds[i] = 'category';
    }
  }
  const out: Segment[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const last = out[out.length - 1];
    if (last && last.kind === kinds[i]) last.text += raw[i];
    else out.push({ text: raw[i]!, kind: kinds[i] ?? null });
  }
  return out;
}
