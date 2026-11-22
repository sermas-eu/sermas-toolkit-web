import { DEFAULT_AVATAR_LANGUAGE } from '../constants.js';

export type SupportedLanguages = Record<string, string>;

// TODO move to API
export const supportedLanguages: SupportedLanguages = {
  'en-GB': 'English',
  'it-IT': 'Italian',
  'de-DE': 'German',
  'pt-PT': 'Portuguese',
  'nl-NL': 'Dutch',
  'fr-FR': 'French',
  'es-ES': 'Spanish',
};

/**
 * The supported language a tag stands for: the same tag, else the same language
 * (`it`, `it-CH` → `it-IT`; `en-US` → `en-GB`). Undefined when not supported.
 */
export const matchSupportedLanguage = (tag?: string | null) => {
  const wanted = tag?.trim().replace('_', '-').toLowerCase();
  if (!wanted) return undefined;
  const keys = Object.keys(supportedLanguages);
  const base = (t: string) => t.split('-')[0].toLowerCase();
  return (
    keys.find((k) => k.toLowerCase() === wanted) ??
    keys.find((k) => base(k) === base(wanted))
  );
};

/** The first candidate that is supported, else English. */
export const resolveLanguage = (candidates: (string | null | undefined)[]) => {
  for (const c of candidates) {
    const match = matchSupportedLanguage(c);
    if (match) return match;
  }
  return DEFAULT_AVATAR_LANGUAGE;
};

/** The browser's preferred languages, most preferred first (none outside a browser). */
export const browserLanguages = (): string[] => {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages?.length) return [...navigator.languages];
  return navigator.language ? [navigator.language] : [];
};
