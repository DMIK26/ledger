import { LANGUAGES, setDictionary, type Language } from '../domain/i18n';

/** Loads a language's words on first use (Drop 13). They are precached, so this works offline. */
export async function loadLanguage(language: Language): Promise<void> {
  if (language === 'te') setDictionary('te', (await import('./te.json')).default);
  else if (language === 'hi') setDictionary('hi', (await import('./hi.json')).default);
  else setDictionary('en', {});
  if (typeof document !== 'undefined')
    document.documentElement.lang = LANGUAGES.find((l) => l.value === language)?.html ?? 'en-IN';
}
