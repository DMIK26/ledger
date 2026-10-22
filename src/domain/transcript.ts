/**
 * Turns speech-recognition results into one line of text for quick add.
 *
 * Browsers disagree on what a result list holds. Chrome gives separate segments ("chai", "twenty
 * cash"). Safari on iPhone often repeats the whole phrase so far in each result ("chai", "chai
 * twenty", "chai twenty cash"), which joined naively becomes "chai chai twenty chai twenty cash".
 * This keeps the longest running phrase and appends only genuinely new segments.
 */
export function mergeTranscripts(segments: readonly string[]): string {
  let text = '';
  for (const raw of segments) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const a = text.toLowerCase();
    const b = s.toLowerCase();
    if (!text) text = s;
    // A cumulative repeat that adds words replaces the phrase so far.
    else if (b.startsWith(a) && b.length > a.length) text = s;
    // A repeat, or a piece already in the phrase, adds nothing.
    else if (a.startsWith(b) || a.endsWith(b)) continue;
    else text = `${text} ${s}`;
  }
  // Dictation adds sentence punctuation ("Chai 20 cash."); quick add does not need it.
  return text.replace(/[.!?]+$/, '').trim();
}
