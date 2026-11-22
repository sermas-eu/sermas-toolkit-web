import {
  matchSupportedLanguage,
  resolveLanguage,
} from './dto/languages.dto.js';
import { Settings } from './settings.js';

const setBrowserLanguages = (languages: string[]) => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '');
};

describe('language resolution', () => {
  it('matches a supported language by tag, then by language', () => {
    expect(matchSupportedLanguage('it-IT')).toBe('it-IT');
    expect(matchSupportedLanguage('it')).toBe('it-IT');
    expect(matchSupportedLanguage('it_CH')).toBe('it-IT');
    expect(matchSupportedLanguage('en-US')).toBe('en-GB');
    expect(matchSupportedLanguage('ja-JP')).toBeUndefined();
    expect(matchSupportedLanguage('')).toBeUndefined();
  });

  it('takes the first supported candidate, else English', () => {
    expect(resolveLanguage(['ja-JP', 'fr-CA', 'de'])).toBe('fr-FR');
    expect(resolveLanguage(['ja-JP', undefined])).toBe('en-GB');
    expect(resolveLanguage([])).toBe('en-GB');
  });
});

describe('Settings language', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts from the browser's language", () => {
    setBrowserLanguages(['it-IT', 'en-US']);
    expect(new Settings().get().language).toBe('it-IT');
  });

  it("the browser's supported language wins over the app's", () => {
    setBrowserLanguages(['it-IT']);
    const settings = new Settings();
    settings.setAppLanguage('de-DE');
    expect(settings.get().language).toBe('it-IT');
  });

  it("the app's language covers an unsupported browser language", () => {
    setBrowserLanguages(['ja-JP']);
    const settings = new Settings();
    settings.setAppLanguage('de-DE');
    expect(settings.get().language).toBe('de-DE');
  });

  it('falls back to English when neither is supported', () => {
    setBrowserLanguages(['ja-JP']);
    const settings = new Settings();
    settings.setAppLanguage('ko-KR');
    expect(settings.get().language).toBe('en-GB');
  });

  it("keeps the visitor's pick until the session ends", async () => {
    setBrowserLanguages(['it-IT']);
    const settings = new Settings();
    settings.init('app1');
    await settings.save({ language: 'fr-FR' });
    // a later save of everything (as the settings menu does) keeps the pick
    await settings.save({ ...settings.get() });
    settings.setAppLanguage('de-DE');
    expect(settings.get().language).toBe('fr-FR');

    settings.resetLanguagePick();
    expect(settings.get().language).toBe('it-IT');
  });

  it('never stores the language on the device', async () => {
    setBrowserLanguages(['it-IT']);
    const settings = new Settings();
    settings.init('app1');
    await settings.save({ language: 'fr-FR' });
    expect(localStorage.getItem('sermas.settings.app1')).not.toContain(
      'language',
    );

    // a language stored by an earlier version is ignored
    localStorage.setItem(
      'sermas.settings.app2',
      JSON.stringify({ language: 'es-ES' }),
    );
    const other = new Settings();
    other.init('app2');
    expect(other.get().language).toBe('it-IT');
  });
});
