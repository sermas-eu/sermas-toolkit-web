import {
  SermasApiClient,
  sleep,
  type PlatformAppDto,
  type RepositoryAssetTypes,
  type RepositoryConfigDto,
  type SessionChangedDto,
  type UserInteractionIntentionDto,
} from '@sermas/api-client';
import EventEmitter2, { ListenerFn } from 'eventemitter2';
import { v4 as uuidv4 } from 'uuid';
import { ApiClient } from './api.js';
import { AuthClient } from './auth.js';
import {
  AvatarModel,
  AvatarModelConfig,
  createWebAvatar,
} from './avatar/index.js';
import { DEFAULT_AVATAR_LANGUAGE, DefaultBackground } from './constants.js';
import { AudioDetection, VideoDetection } from './detection/index.js';
import { InteractionType } from './dto/detection.dto.js';
import { ErrorEventDto, ErrorReason } from './dto/errors.dto.js';
import { UiButtonSession } from './dto/ui.dto.js';
import { EventListenerTracker, emitter } from './events.js';
import { FpsMonitor } from './fps.js';
import { Logger, initLogger } from './logger.js';
import { MqttClient } from './mqtt-client.js';
import { Settings } from './settings.js';
import { UI } from './ui.js';
import { UserAuth } from './user-auth.js';
export * from '@sermas/api-client';
export * from './constants.js';
// exports
export * from '@sermas/api-client';
export * from './constants.js';
export { type UserAuth } from './user-auth.js';

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
  private readonly userAuth: UserAuth;

  private readonly apiClient: SermasApiClient;

  private token?: string | null;

  private userId?: string;
  private sessionId?: string;
  private app?: PlatformAppDto;
  private readonly baseUrl: string;

  private videoDetection?: VideoDetection;
  private audioDetection?: AudioDetection;

  private heartbitInterval: NodeJS.Timeout;

  private avatar?: AvatarModel;
  private repositoryDefaults?: RepositoryConfigDto | undefined;

  private availableModels: string[] = [];

  private ui: UI;

  constructor(private readonly options: SermasToolkitOptions) {
    initLogger();

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

    this.userAuth = new UserAuth(this);

    this.apiClient = new SermasApiClient({
      appId: options.appId,
      baseURL: options.url,
      clientId: authClientId,
      logger: this.logger,
    });
  }

  getApiClient() {
    return this.apiClient;
  }

  getAvailableModels() {
    return this.availableModels;
  }

  async createWebAvatar(
    avatarConfig?: Partial<AvatarModelConfig>,
  ): Promise<AvatarModel> {
    avatarConfig = avatarConfig || (await this.getAvatarConfig());

    this.avatar = await createWebAvatar(
      avatarConfig as AvatarModelConfig,
      this,
    );
    return this.avatar;
  }

  getUI() {
    if (!this.ui) {
      this.ui = new UI(this);
    }
    return this.ui;
  }

  getAudioDetection() {
    if (!this.audioDetection) this.audioDetection = new AudioDetection(this);
    return this.audioDetection!;
  }

  getVideoDetection() {
    if (!this.videoDetection) this.videoDetection = new VideoDetection(this);
    return this.videoDetection!;
  }

  getCurrentUser() {
    return this.userAuth.getCurrentUser();
  }

  getUserAuth(): UserAuth {
    return this.userAuth;
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
    this.logger.debug(`Created new session sessionId=${this.sessionId}`);
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
    this.app = app || undefined;
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
    this.settings.save({ ...this.settings.get(), ...(app.settings || {}) });
  }

  onAvatarSpeechStop() {
    this.logger.log(`Stop avatar generation`);
    this.getApi().sendForceStop();
  }

  async onSessionChanged(ev: SessionChangedDto) {
    this.logger.debug(
      `session event ${ev.operation} sessionId=${ev.record.sessionId}`,
    );

    if (ev.operation === 'updated') {
      if (ev.record.closedAt) {
        this.logger.log('Session closed');
        if (this.settings?.get().interactionStart == 'on-load') {
          // on session close, generate new sessionId and propagate to APIs
          this.logger.log(`Creating new session id`);
          this.createSessionId();
        } else {
          this.setSessionId(undefined);
        }
      }
    }
  }

  async closeSession() {
    await this.api.closeSession();
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
    this.off('detection.interaction', this.onInteractionDetection);

    // clear all registered event listeners
    this.listeners.clear();

    this.userId = undefined;
    this.sessionId = undefined;

    if (this.avatar) {
      this.removeAllListeners('avatar.status');
      await this.avatar?.destroy();
    }

    if (this.heartbitInterval) clearInterval(this.heartbitInterval);
  }

  async init(token?: string | null) {
    this.token = token;

    if (token) this.apiClient.setToken(token);

    this.onApp = this.onApp.bind(this);
    this.onSession = this.onSession.bind(this);
    this.onUiButtonSession = this.onUiButtonSession.bind(this);
    this.onAvatarSpeechStop = this.onAvatarSpeechStop.bind(this);
    this.onSessionChanged = this.onSessionChanged.bind(this);
    this.onUserChanged = this.onUserChanged.bind(this);
    this.onInteractionDetection = this.onInteractionDetection.bind(this);

    // internal events handler
    this.on('session', this.onSession);
    this.on('app', this.onApp);
    this.on('ui.button.session', this.onUiButtonSession);
    this.on('avatar.speech.stop', this.onAvatarSpeechStop);
    this.on('session.session', this.onSessionChanged);
    this.on('user.changed', this.onUserChanged);
    this.on('detection.interaction', this.onInteractionDetection);

    this.logger.debug(`appId=${this.options.appId}`);

    if (token) {
      this.logger.debug('Using provided token');
      this.auth.setToken(token);
      this.api.setToken(token);
    }

    // load current app
    await this.loadApp(this.options.appId);

    // load user credentials if available.
    // check if login is required
    // load previous session if credentials are available
    const appRequiresLogin = await this.userAuth.appRequiresLogin();
    if (appRequiresLogin) {
      this.logger.debug(`Login requred for app ${this.getAppId()}`);

      const currentUser = await this.userAuth.loadUser();

      if (currentUser) {
        // load last session
        const session = await this.api.getUserSession(
          this.getAppId(),
          this.userAuth.getToken(),
        );
        if (session) {
          this.logger.debug(
            `loaded existing session sessionId=${session.sessionId}`,
          );
          this.setSessionId(session.sessionId);
        }
      }
    }

    if (token) {
      const topics = await this.api.listTopics(this.options.moduleId);
      if (topics) {
        this.broker.setTopics(topics);
      } else {
        this.logger.warn(`Failed to fetch topics`);
      }
      await this.broker.connect(token);
    }

    try {
      const availableModels = await this.api.listModels();
      this.availableModels = availableModels || [];
    } catch (e: any) {
      this.logger.debug(`Failed loading models: ${e.stack}`);
    }

    await this.fpsMonitor.init();

    this.on('avatar.status', async (status: 'ready' | 'removed') => {
      if (status !== 'ready') return;
      if (this.settings?.get().interactionStart == 'on-load') {
        this.createSessionId();
        await this.sendHeartBit();
      }
    });

    this.emit('ready', this);
  }

  public async triggerInteraction(source: string, trigger: 'start' | 'stop') {
    const sessionId = this.getSessionId();
    this.onInteractionDetection({
      source,
      appId: this.getAppId(),
      sessionId: sessionId ? sessionId : '',
      moduleId: 'detection',
      interactionType: trigger,
      probability: 1.0,
    });
  }

  private async onInteractionDetection(ev: UserInteractionIntentionDto) {
    let sessionId = this.getSessionId();
    if (sessionId) {
      if (ev.interactionType === 'stop' && sessionId == ev.sessionId) {
        this.ui.clearHistory();
        await this.api.sendChatMessage({
          actor: 'agent',
          sessionId: ev.sessionId,
          appId: ev.appId,
          text: 'Goodbye, see you next time!',
          language: 'en-GB',
          emotion: 'happy',
        });
        this.api.saveRecord({
          appId: this.getAppId(),
          sessionId: ev.sessionId,
          type: 'interaction',
          label: `Interaction event ${ev.interactionType.toUpperCase()} from ${ev.source.toUpperCase()}`,
          ts: new Date().toString(),
          data: ev,
        });
        await sleep(10000);
        await this.closeSession();
      }
      return;
    }

    if (ev.source == 'ui' && this.settings?.get().interactionStart != 'touch')
      return;
    if (
      ev.source == 'microphone' &&
      this.settings?.get().interactionStart != 'speak'
    )
      return;
    if (
      ev.source == 'camera' &&
      this.settings?.get().interactionStart != 'intent-detection'
    )
      return;

    this.logger.log(`Starting interaction on event from source ${ev.source}`);
    this.createSessionId();
    await this.sendHeartBit();
    sessionId = this.getSessionId();
    this.api.saveRecord({
      appId: this.getAppId(),
      sessionId: sessionId ? sessionId : '',
      type: 'interaction',
      label: `Interaction event ${ev.interactionType.toUpperCase()} from ${ev.source.toUpperCase()}`,
      ts: new Date().toString(),
      data: ev,
    });
  }

  private async sendHeartBit() {
    await this.api.sendAgentHeartBeat({
      appId: this.options.appId,
      moduleId: this.options.moduleId,
      status: 'ready',
      sessionId: this.sessionId,
      userId: this.userId,
      settings: this.settings.export(),
    });
    this.logger.debug(`Sent heartbit sessionId=${this.sessionId}`);
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

  async configureLoader(
    type: RepositoryAssetTypes,
    id: string,
    loader: {
      setWithCredentials: (set: boolean) => any;
      setRequestHeader: (headers: Record<string, any>) => any;
    },
    useDefaults = true,
  ): Promise<string | undefined> {
    let config = await this.getAssetConfig(type, id);
    if (!config) {
      this.logger.warn(`Asset config ${type} ${id} not found`);
      if (!useDefaults) return undefined;
      this.logger.debug(`using default asset for ${type} loader`);

      const repositoryDefaults = await this.getRepositoryDefaults();
      const repo = repositoryDefaults ? repositoryDefaults[type] : undefined;
      if (!repo || !repo.length) return undefined;
      config = repo[0];
    }

    if (config.path.startsWith('http')) return config.path;

    loader.setWithCredentials(true);
    loader.setRequestHeader({ Authorization: `Bearer ${this.token}` });
    return `${this.baseUrl}/api/ui/asset/${this.getAppId()}/${config.type}/${config.id}`;
  }

  async getAvatarBackgroundPath(path?: string): Promise<string> {
    // skip url
    if (path?.startsWith('http')) return path;

    const app = await this.getApp();
    if (!app) return DefaultBackground.path;

    path = path || app?.settings?.background;

    const filtered = app.repository?.backgrounds?.filter(
      (b) => b.id === path || b.path === path,
    );

    return filtered?.length ? filtered[0].path : DefaultBackground.path;
  }

  async getAvatarGender(avatarName?: string): Promise<undefined | string> {
    const avatar = await this.getAvatarConfig(avatarName);
    if (!avatar) return undefined;
    return avatar.gender;
  }

  async getAvatarConfig(
    avatarId?: string,
  ): Promise<AvatarModelConfig | undefined> {
    const app = await this.getApp();
    avatarId = avatarId || this.settings.get().avatar || app?.settings?.avatar;
    if (!avatarId) return undefined;
    return await this.getAssetConfig<AvatarModelConfig>('avatars', avatarId);
  }

  async getAssetConfig<
    T = { id: string; path: string; type: RepositoryAssetTypes },
  >(type: RepositoryAssetTypes, id: string, defaultValue?: T) {
    const app = await this.getApp();
    if (!id || !app || !app.repository) return defaultValue;

    const repo = app?.repository[type];
    if (!repo) return defaultValue;

    const filtered = repo?.filter((a) => a.id === id);

    return filtered && filtered.length ? (filtered[0] as T) : defaultValue;
  }

  getAppLanguage() {
    return this.settings.get().language || DEFAULT_AVATAR_LANGUAGE;
  }

  async getRepositoryDefaults() {
    if (!this.repositoryDefaults) {
      const repositoryDefaults = await this.api.getRepositoryDefaults();
      this.repositoryDefaults = repositoryDefaults || undefined;
    }
    return this.repositoryDefaults;
  }
}
