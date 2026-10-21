/**
 * Converts spoken amounts ("two fifty", "five hundred", "twenty") into digits so voice input can
 * reach the quick-add parser. Single small words (one, two, three) are left alone unless a rupee
 * word follows, because they are common in merchant names ("Cafe One").
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, lakh: 100000, lakhs: 100000 };

const isNumberWord = (w: string): boolean => w in UNITS || w in TENS || w in SCALES;
const RUPEE_WORD = /^(?:rupees?|rs\.?|inr)$/i;

function compose(words: string[]): number | null {
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (w === 'and') continue;
    if (w in UNITS) current += UNITS[w]!;
    else if (w in TENS) current += TENS[w]!;
    else if (w === 'hundred') current = (current || 1) * 100;
    else if (w in SCALES) {
      total += (current || 1) * SCALES[w]!;
      current = 0;
    } else return null;
  }
  return total + current;
}

function runValue(words: string[]): number | null {
  const first = words[0];
  const second = words[1];
  const hasScale = words.some((w) => w in SCALES);
  // Colloquial "two fifty" = 250 and "one fifty five" = 155.
  if (
    !hasScale && first !== undefined && second !== undefined &&
    first in UNITS && UNITS[first]! >= 1 && UNITS[first]! <= 9 && second in TENS
  ) {
    const rest = compose(words.slice(1));
    return rest === null ? null : UNITS[first]! * 100 + rest;
  }
  return compose(words);
}

export function replaceNumberWords(input: string): string {
  const parts = input.split(/(\s+)/); // words and the whitespace between them
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const part = parts[i]!;
    const lower = part.toLowerCase();
    if (!isNumberWord(lower)) {
      out.push(part);
      i += 1;
      continue;
    }
    // Collect a run of number words (and "and" between them) separated by single whitespace.
    const run: string[] = [lower];
    let end = i;
    let j = i + 2;
    while (j < parts.length) {
      const next = parts[j]!.toLowerCase();
      if (isNumberWord(next)) {
        run.push(next);
        end = j;
        j += 2;
      } else if (next === 'and' && parts[j + 2] !== undefined && isNumberWord(parts[j + 2]!.toLowerCase())) {
        run.push('and');
        j += 2;
      } else break;
    }
    const following = parts[end + 2];
    const hasTensOrScale = run.some((w) => w in TENS || w in SCALES);
    const rupeeNext = following !== undefined && RUPEE_WORD.test(following);
    const value = hasTensOrScale || rupeeNext ? runValue(run) : null;
    if (value !== null) {
      out.push(String(value));
      i = end + 1;
    } else {
      for (let k = i; k <= end; k += 1) out.push(parts[k]!);
      i = end + 1;
    }
  }
  return out.join('');
}
