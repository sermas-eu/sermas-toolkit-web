import type { PlatformAppDto, SessionChangedDto } from '@sermas/api-client';
import EventEmitter2, { ListenerFn } from 'eventemitter2';
import { v4 as uuidv4 } from 'uuid';
import { ApiClient } from './api.js';
import { AuthClient } from './auth.js';
import { InteractionType } from './dto/detection.dto.js';
import { ErrorEventDto, ErrorReason } from './dto/errors.dto.js';
import { UiButtonSession } from './dto/ui.dto.js';
import { EventListenerTracker, emitter } from './events.js';
import { FpsMonitor } from './fps.js';
import { Logger } from './logger.js';
import { MqttClient } from './mqtt-client.js';
import { Settings } from './settings.js';

// exports
// export * from './dto.js';
export * from '@sermas/api-client';
export * from './constants.js';
// export * as avatar from './avatar.js';
// export * as detection from './detection.js';
// export { Logger, logger } from './logger.js';
// export { UI } from './ui.js';
// export * as util from './utils.js';

export type Env = 'local' | 'dev' | 'staging' | 'prod';
const defaultEnv: Env = 'prod';

const getEnv = (): Env => {
  if (typeof document === 'undefined') return defaultEnv;
  if (!document.location.hostname) return defaultEnv;

  if (document.location.hostname === 'localhost') return 'local';

  const parts = document.location.hostname.split('.');
  if (!parts.length) return defaultEnv;

  if (parts[0] === 'local') return 'local';
  if (parts[0] === 'dev') return 'dev';
  if (parts[0] === 'staging') return 'staging';
  if (parts[0] === 'prod') return 'prod';

  return defaultEnv;
};

export interface AssetRequestParams {
  url: string;
  withCredentials?: boolean;
  headers?: Record<string, any>;
}

export interface SermasToolkitOptions {
  url: string;

  appId: string;
  moduleId: string;

  auth: {
    url: string;
    clientId?: string;
    realm?: string;
  };
}

const getUrl = () => {
  if (typeof document === 'undefined') return undefined;
  const { hostname, protocol, port } = document.location;
  return `${protocol}//${hostname}${port ? ':' + port : ''}`;
};

export class SermasToolkit {
  private readonly logger = new Logger('toolkit');

  private readonly settings: Settings = new Settings();
  private readonly fpsMonitor: FpsMonitor;

  private readonly emitter: EventEmitter2 = emitter;
  private readonly listeners: EventListenerTracker = new EventListenerTracker(
    emitter,
  );

  private readonly api: ApiClient;
  private readonly auth: AuthClient;
  private readonly broker: MqttClient;

  private token?: string | null;

  private userId?: string;
  private sessionId?: string;
  private app?: PlatformAppDto;
  private readonly baseUrl: string;

  constructor(private readonly options: SermasToolkitOptions) {
    this.fpsMonitor = new FpsMonitor(this.emitter);

    const env = getEnv();

    const baseUrl = this.options.url || getUrl();
    if (!baseUrl)
      throw new Error(
        `Failed to detect baseUrl. Please provide the 'url' option in config.`,
      );

    this.logger.debug(`baseUrl=${baseUrl}`);
    this.baseUrl = baseUrl;

    const appId = this.options.appId;
    const moduleId = this.options.moduleId;

    const authUrl = this.options.auth.url;
    const authClientId = this.options.auth.clientId || 'sermas';
    const authRealm = this.options.auth.realm || `sermas-${env}`;

    const apiUrl = `${baseUrl}/api`;

    this.settings.init();

    this.api = new ApiClient({
      url: apiUrl,
      appId,
    });

    this.auth = new AuthClient({
      authUrl,
      authClientId,
      authRealm,
      refreshToken: () => {
        return this.api.refreshToken();
      },
    });

    this.broker = new MqttClient({
      url: baseUrl,
      appId,
      moduleId,
    });
  }

  getSettings() {
    return this.settings;
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  async setAppId(appId: string) {
    this.options.appId = appId;
    this.loadApp();
  }

  getAppId() {
    return this.options.appId;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  setSessionId(sessionId?: string | undefined) {
    this.emit('session', sessionId);
    this.sessionId = sessionId;
  }

  createSessionId(): string {
    const sessionId = uuidv4();
    this.setSessionId(sessionId);
    return sessionId;
  }

  getUserId() {
    return this.userId;
  }

  setUserId(userId?: string) {
    this.userId = userId;
    this.emit('user.changed', userId);
  }

  async loadApp(appId?: string) {
    const app = await this.api.getApp(appId || this.options.appId);
    this.app = app ? app : undefined;
    this.emitter.emit('app', app);
  }

  async getApp() {
    if (!this.app) await this.loadApp();
    return this.app;
  }

  getApi() {
    return this.api;
  }

  getBroker() {
    return this.broker;
  }

  getToken() {
    return this.token;
  }

  onSession(sessionId: string | undefined) {
    this.api.setSessionId(sessionId);
    this.broker.setSessionId(sessionId);
  }

  onApp(app: PlatformAppDto) {
    // failed to load
    if (app === null) {
      this.emit('failure', {
        reason: ErrorReason.MISSING_APP,
      } as ErrorEventDto);
      return;
    }

    this.api.setAppId(app?.appId);
    this.broker.setAppId(app?.appId);
    this.settings.save(app.settings || {});
  }

  onAvatarSpeechStop() {
    this.logger.log(`Stop avatar generation`);
    this.getApi().sendForceStop();
  }

  onSessionChanged(ev: SessionChangedDto) {
    this.logger.debug(
      `session event ${ev.operation} sessionId=${ev.record.sessionId}`,
    );

    if (ev.operation === 'updated') {
      if (ev.record.closedAt) {
        // on session close, generate new sessionId and propagate to APIs
        this.logger.log(`Session closed, creating new session id`);
        this.createSessionId();
      }
    }
  }

  onUiButtonSession(ev: UiButtonSession) {
    const interactionType =
      ev.status === 'started' ? InteractionType.start : InteractionType.stop;

    this.getApi().interactionIntention(
      ev.source,
      ev.trigger,
      interactionType,
      this.sessionId,
    );
  }

  async onUserChanged(userId?: string) {
    this.logger.debug(`userId=${userId}`);
    this.api.setUserId(userId);
    this.broker.setUserId(userId);

    if (userId && this.getSessionId()) {
      const session = await this.api.getSession(this.getSessionId());

      if (session && !session.userId) {
        session.userId = this.userId;
        await this.api.updateSession(session);
      }

      // if (session?.sessionId) this.setSessionId(session?.sessionId);
    }
  }

  async destroy() {
    await this.fpsMonitor.destroy();

    this.off('session', this.onSession);
    this.off('app', this.onApp);
    this.off('ui.button.session', this.onUiButtonSession);
    this.off('avatar.speech.stop', this.onAvatarSpeechStop);
    this.off('session.session', this.onSessionChanged);
    this.off('user.changed', this.onUserChanged);

    // clear all registered event listeners
    this.listeners.clear();
  }

  async init(token?: string | null) {
    this.token = token;

    this.onApp = this.onApp.bind(this);
    this.onSession = this.onSession.bind(this);
    this.onUiButtonSession = this.onUiButtonSession.bind(this);
    this.onAvatarSpeechStop = this.onAvatarSpeechStop.bind(this);
    this.onSessionChanged = this.onSessionChanged.bind(this);
    this.onUserChanged = this.onUserChanged.bind(this);

    // internal events handler
    this.on('session', this.onSession);
    this.on('app', this.onApp);
    this.on('ui.button.session', this.onUiButtonSession);
    this.on('avatar.speech.stop', this.onAvatarSpeechStop);
    this.on('session.session', this.onSessionChanged);
    this.on('user.changed', this.onUserChanged);

    this.logger.debug(`appId=${this.options.appId}`);

    this.createSessionId();
    this.logger.debug(`sessionId=${this.sessionId}`);

    if (token) {
      this.logger.debug('Using provided token');
      this.auth.setToken(token);
      this.api.setToken(token);
    }

    await this.loadApp(this.options.appId);

    if (token) {
      const topics = await this.api.listTopics(this.options.moduleId);
      if (topics) {
        this.broker.setTopics(topics);
      } else {
        this.logger.warn(`Failed to fetch topics`);
      }
      await this.broker.connect(token);
    }

    await this.api.sendAgentHeartBeat({
      appId: this.options.appId,
      moduleId: this.options.moduleId,
      status: 'ready',
      sessionId: this.sessionId,
      userId: this.userId,
    });

    await this.fpsMonitor.init();

    this.emit('ready', this);
  }

  emit(event: string, ...args: any[]): void {
    this.emitter.emit.apply(this.emitter, [event, ...args]);
  }

  on(event: string, callback: ListenerFn) {
    this.listeners.add(event, callback);
    this.emitter.on(event, callback);
  }

  off(event: string, callback: ListenerFn) {
    this.listeners.remove(event, callback);
    this.emitter.off(event, callback);
  }

  removeAllListeners(event: string) {
    this.listeners.remove(event);
    this.emitter.removeAllListeners(event);
  }

  getAssetRequestParams(path: string): AssetRequestParams {
    const publicUrl = path.indexOf('https') > -1;

    let url = path;
    let withCredentials = false;
    let headers: Record<string, any> | undefined = undefined;

    if (!publicUrl) {
      withCredentials = true;
      headers = { Authorization: `Bearer ${this.token}` };
      url = `${this.baseUrl}/api/ui/asset/${this.getAppId()}?path=${path}`;
    }

    return {
      url,
      withCredentials,
      headers,
    };
  }
}
