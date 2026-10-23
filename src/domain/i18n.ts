/**
 * The interface language (Drop 13). English text is the key; Telugu and Hindi dictionaries map it to
 * a translation, and anything without one shows in English. Placeholders are {0}, {1}… so a
 * translation can put them where its grammar wants. Amounts and digits are never translated.
 */

export type Language = 'en' | 'te' | 'hi';

export const LANGUAGES: ReadonlyArray<{ value: Language; label: string; html: string }> = [
  { value: 'en', label: 'English', html: 'en-IN' },
  { value: 'te', label: 'తెలుగు', html: 'te' },
  { value: 'hi', label: 'हिन्दी', html: 'hi' },
];

export type Dictionary = Readonly<Record<string, string>>;

let language: Language = 'en';
let dictionary: Dictionary = {};

export const getLanguage = (): Language => language;

export function setDictionary(next: Language, words: Dictionary): void {
  language = next;
  dictionary = next === 'en' ? {} : words;
}

type Part = string | number | null | undefined;

const fill = (text: string, vars: ReadonlyArray<Part>): string =>
  text.replace(/\{(\d+)\}/g, (m, i: string) =>
    Number(i) < vars.length ? String(vars[Number(i)]) : m,
  );

/**
 * The text in the chosen language, with {0}, {1}… filled in. (Named tl, as `t` is the usual name
 * for an entry in this code.)
 */
export function tl(text: string, ...vars: ReadonlyArray<Part>): string {
  const out = dictionary[text] ?? text;
  return vars.length > 0 ? fill(out, vars) : out;
}

/**
 * Marks text kept in a list made when the app starts, so it can be found for translating; it is
 * translated with tl() where it is shown.
 */
export const msg = (text: string): string => text;

/** Whether a translation exists (for tests and the coverage check). */
export const hasTranslation = (text: string): boolean => text in dictionary;
