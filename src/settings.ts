import { AppSettingsDto } from '@sermas/api-client';
import { DEFAULT_AVATAR_LANGUAGE } from './constants.js';
import { AppSettings } from './dto.js';
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
    enableMirrorMode: false,
    animationList: [],
    devMode: false,
    rpmUrl: '',
    rpmGender: '',
    enableVideoDetection: true,
    detectorHuman: true,
    detectorFaceLandmarker: false,
    qrcode: true,
    interactionStart: 'on-load',
    virtualKeyboardEnabled: false,
  };

  constructor() {
    this.settings = this.getDefaults();
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
      llm: settings.llm || llmDefaults(),
      background: settings.background,
      interactionStart: settings.interactionStart,
      virtualKeyboardEnabled: settings.virtualKeyboardEnabled,
      language: settings.language,
      subtitlesEnabled: settings.subtitlesEnabled,
    };

    localStorage.setItem(`sermas.settings.${this.appId}`, JSON.stringify(cfg));
  }

  private loadLocalStorage(): Partial<AppSettings> | false | undefined {
    if (typeof localStorage === 'undefined') return undefined;
    try {
      const raw = localStorage.getItem(`sermas.settings.${this.appId}`);
      if (!raw) return false;
      const json = JSON.parse(raw) as Partial<AppSettings>;
      // todo: fix to update localStorage, remove after 09/2024
      if (json.llm && typeof json.llm === 'string') {
        json.llm = llmDefaults();
      }
      // /fix

      // align tts settings, propagated to backend
      json.ttsEnabled = json.enableAudio;

      return json;
    } catch (e: any) {
      logger.error(`Failed loading local storage: ${e.message}`);
      return false;
    }
  }

  init(appId: string) {
    this.appId = appId;
    const storage = this.loadLocalStorage();
    if (storage) {
      this.settings = { ...this.settings, ...(storage || {}) };
    }
  }

  destroy() {}

  get(): AppSettings {
    return this.settings;
  }

  async save(cfg: Partial<AppSettings>): Promise<AppSettings> {
    cfg = cfg || {};
    this.settings = { ...this.settings, ...cfg };
    this.saveLocalStorage(this.settings);
    emitter.emit('settings', this.settings);
    return this.settings;
  }

  async load(): Promise<AppSettings> {
    const saved = this.loadLocalStorage();

    this.settings = {
      ...this.settings,
      ...(saved || {}),
    } as AppSettings;

    this.settings.llm = this.settings.llm || llmDefaults();

    return this.settings;
  }

  hasSavedSettings() {
    return !!this.loadLocalStorage();
  }
}
