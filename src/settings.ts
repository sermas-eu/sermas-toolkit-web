import { AppSettingsDto } from '@sermas/api-client';
import { emitter } from './events.js';
import { DEFAULT_AVATAR_LANGUAGE } from './constants.js';
import { AppSettings } from './dto.js';
import { logger } from './logger.js';

export class Settings {
  private settings: AppSettings;

  private readonly defaults: AppSettings = {
    login: false,
    avatar: 'default',
    background: 'backgrounds/default',
    llm: 'openai',
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
    };

    localStorage.setItem(`sermas.settings`, JSON.stringify(cfg));
  }

  private loadLocalStorage(): Partial<AppSettings> | false | undefined {
    if (typeof localStorage === 'undefined') return undefined;
    try {
      const raw = localStorage.getItem(`sermas.settings`);
      if (!raw) return false;
      return JSON.parse(raw) as Partial<AppSettings>;
    } catch (e: any) {
      logger.error(`Failed loading local storage: ${e.message}`);
      return false;
    }
  }

  init() {
    const storage = this.loadLocalStorage();
    if (storage === false) {
      this.saveLocalStorage(this.settings);
    } else {
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

    return this.settings;
  }
}
