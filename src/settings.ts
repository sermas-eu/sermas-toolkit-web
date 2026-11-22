import { type AppSettingsDto } from '@sermas/api-client';
import { DEFAULT_AVATAR_LANGUAGE } from './constants.js';
import { AppSettings } from './dto.js';
import { browserLanguages, resolveLanguage } from './dto/languages.dto.js';
import { emitter } from './events.js';
import { logger } from './logger.js';

export const llmDefaults = () => ({
  chat: '',
  tools: '',
  tasks: '',
  translation: '',
  sentiment: '',
  intent: '',
});

export class Settings {
  private settings: AppSettings;
  private appId: string;
  // The language: the visitor's pick for this session, else the browser's, else the
  // app's, else English (only supported languages count). Never stored on the device:
  // a kiosk's next visitor starts from detection again.
  private languagePick?: string;
  private appLanguage?: string;

  private readonly defaults: AppSettings = {
    login: false,
    avatar: 'default',
    background: 'backgrounds/default',
    llm: llmDefaults(),
    language: DEFAULT_AVATAR_LANGUAGE,
    // developerMode
    testFace: '',
    enableTestFaces: false,
    enableAvatar: true,
    enableMic: true,
    enableAudio: true,
    showVideo: false,
    animation: '',
    enableAnimation: true,
    animationList: [],
    devMode: false,
    rpmUrl: '',
    rpmGender: '',
    enableVideoDetection: true,
    detectorFaceLandmarker: false,
    qrcode: true,
    interactionStart: 'on-load',
    virtualKeyboardEnabled: false,
    subtitlesEnabled: true,
    resetPrivacyEverySession: false,
    pushToTalkEnabled: false,
  };

  constructor() {
    this.settings = this.getDefaults();
    this.settings.language = this.resolveLanguage();
  }

  private resolveLanguage() {
    return resolveLanguage([
      this.languagePick,
      ...browserLanguages(),
      this.appLanguage,
    ]);
  }

  /** The app's configured language, used when the browser's is not supported. */
  setAppLanguage(language?: string) {
    this.appLanguage = language;
    this.settings.language = this.resolveLanguage();
  }

  /** Forgets the visitor's pick (the session ended): back to the detected language. */
  resetLanguagePick() {
    this.languagePick = undefined;
    const language = this.resolveLanguage();
    if (language === this.settings.language) return;
    this.settings = { ...this.settings, language };
    emitter.emit('settings', this.settings);
  }

  export() {
    const appSettingsDto: AppSettingsDto = {
      login: this.settings.login,
      avatar: this.settings.avatar,
      background: this.settings.background,
      language: this.settings.language,
      llm: this.settings.llm,
      ttsEnabled: this.settings.enableAudio,
    };
    return appSettingsDto;
  }

  getDefaults(): AppSettings {
    return {
      ...this.defaults,
    };
  }

  private saveLocalStorage(settings: AppSettings) {
    if (typeof localStorage === 'undefined') return;

    const cfg = {
      enableAudio: settings.enableAudio,
      enableMic: settings.enableMic,
      devMode: settings.devMode === true ? true : false,
      avatar: settings.avatar,
      background: settings.background,
      interactionStart: settings.interactionStart,
      virtualKeyboardEnabled: settings.virtualKeyboardEnabled,
      subtitlesEnabled: settings.subtitlesEnabled,
      pushToTalkEnabled: settings.pushToTalkEnabled,
    };

    localStorage.setItem(`sermas.settings.${this.appId}`, JSON.stringify(cfg));
  }

  private saveSessionStorage(settings: AppSettings) {
    if (typeof sessionStorage === 'undefined') return;

    const cfg = {
      llm: settings.llm || llmDefaults(),
    };

    sessionStorage.setItem(
      `sermas.settings.${this.appId}`,
      JSON.stringify(cfg),
    );
  }

  private loadLocalStorage(): Partial<AppSettings> | false | undefined {
    if (typeof localStorage === 'undefined') return undefined;
    try {
      const raw = localStorage.getItem(`sermas.settings.${this.appId}`);
      if (!raw) return false;
      const json = JSON.parse(raw) as Partial<AppSettings>;
      // stored by earlier versions: the language is detected each session now
      delete json.language;

      // align tts settings, propagated to backend
      json.ttsEnabled = json.enableAudio;

      return json;
    } catch (e: any) {
      logger.error(`Failed loading local storage: ${e.message}`);
      return false;
    }
  }

  private loadSessionStorage(): Partial<AppSettings> | false | undefined {
    if (typeof sessionStorage === 'undefined') return undefined;
    try {
      const raw = sessionStorage.getItem(`sermas.settings.${this.appId}`);
      if (!raw) return false;
      const json = JSON.parse(raw) as Partial<AppSettings>;
      if (json.llm && typeof json.llm === 'string') {
        json.llm = llmDefaults();
      }
      return json;
    } catch (e: any) {
      logger.error(`Failed session session storage: ${e.message}`);
      return false;
    }
  }

  init(appId: string) {
    this.appId = appId;
    const savedLocalStorage = this.loadLocalStorage();
    // const savedSessionStorage = this.loadSessionStorage();
    // if (savedLocalStorage || savedSessionStorage) {
    if (savedLocalStorage) {
      this.settings = {
        ...this.settings,
        ...(savedLocalStorage || {}),
        // ...(savedSessionStorage || {}),
      };
    }
  }

  destroy() {}

  get(): AppSettings {
    return this.settings;
  }

  getPartial(): Partial<AppSettings> {
    return this.settings;
  }

  async save(cfg: Partial<AppSettings>): Promise<AppSettings> {
    cfg = cfg || {};
    // a language other than the current one is the visitor's pick (the settings
    // menu saves everything on each change)
    if (cfg.language && cfg.language !== this.settings.language) {
      this.languagePick = cfg.language;
    }
    this.settings = { ...this.settings, ...cfg };
    this.saveLocalStorage(this.settings);
    // this.saveSessionStorage(this.settings);
    emitter.emit('settings', this.settings);
    return this.settings;
  }

  async load(): Promise<AppSettings> {
    const savedLocalStorage = this.loadLocalStorage();
    const savedSessionStorage = this.loadSessionStorage();

    this.settings = {
      ...this.settings,
      ...(savedLocalStorage || {}),
      ...(savedSessionStorage || {}),
    } as AppSettings;

    this.settings.llm = this.settings.llm || llmDefaults();

    return this.settings;
  }

  hasSavedLocalSettings() {
    return !!this.loadLocalStorage();
  }

  hasSavedSessionSettings() {
    return !!this.loadSessionStorage();
  }
}
