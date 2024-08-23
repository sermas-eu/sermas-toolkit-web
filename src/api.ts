import type {
  AgentHeartBeatEventDto,
  AuthJwtUser,
  DatasetRecordDto,
  DialogueMessageDto,
  JwtTokenDto,
  LoginRequestDto,
  LoginResponseDto,
  PlatformAppDto,
  RepositoryConfigDto,
  SessionDto,
  UIModelMapBlendShapesRequestDto,
  UIModelMapBlendShapesResponseDto,
  UserInteractionIntentionDto,
} from '@sermas/api-client';
import {
  Axios,
  AxiosError,
  isAxiosError,
  type AxiosRequestConfig,
} from 'axios';
import { AuthToken } from './auth.js';
import { AgentStatus, InteractionType, UserReferenceSource } from './dto.js';
import { Logger } from './logger.js';

export interface ApiClientOptions {
  token?: string;
  url: string;
  appId?: string;
}

export class ApiClient {
  private readonly logger = new Logger('api');

  private appId?: string;
  private userId?: string;
  private sessionId?: string;

  private client?: Axios;
  private readonly auth: AuthToken = new AuthToken();

  setUserId(userId?: string) {
    this.userId = userId;
  }

  setAppId(appId?: string) {
    this.appId = appId;
  }

  setSessionId(sessionId?: string) {
    this.sessionId = sessionId;
  }

  constructor(private readonly options: ApiClientOptions) {
    this.setToken(this.options.token);
    this.appId = this.options.appId;
  }

  setToken(token?: string) {
    this.auth.set(token);
    this.client = this.createClient();
  }

  requireAppId(): string | undefined {
    if (!this.appId) {
      this.logger.error(`appId not set`);
    }
    return this.appId;
  }

  requireSessionId(): string | undefined {
    if (!this.sessionId) {
      this.logger.error(`sessionId not set`);
    }
    return this.sessionId;
  }

  createClient(): Axios {
    return new Axios({
      baseURL: this.options.url,
      headers: {
        ...(this.auth.getToken()
          ? { Authorization: `Bearer ${this.auth.getToken()}` }
          : {}),
        'content-type': 'application/json',
      },
      transformResponse: [
        (data, headers) => {
          // console.log(data, headers);
          if (
            headers['content-type'] === 'application/octet-stream' ||
            headers['content-type'] === 'text/html; charset=utf-8' ||
            headers['content-type'] === 'application/zip'
          ) {
            return data;
          }

          try {
            const response = JSON.parse(data);
            if (response && response.statusCode >= 400) {
              throw new Error(`Request failed with ${response.statusCode}`);
            }
            return response;
          } catch (e) {
            return null;
          }
        },
      ],
      transformRequest: [
        (data, headers) => {
          if (headers['content-type'] === 'multipart/form-data') {
            return data;
          }
          return JSON.stringify(data);
        },
      ],
    });
  }

  getClient(): Axios {
    if (!this.client) {
      this.client = this.createClient();
    }
    return this.client;
  }

  async post<T = any>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
  ): Promise<T | null> {
    try {
      if (!data.appId && this.appId) data.appId = this.appId;
      if (!data.userId && this.userId) data.userId = this.userId;
      if (!data.sessionId && this.sessionId) data.sessionId = this.sessionId;

      const res = await this.getClient().post(url, data, config);
      return res.data as T;
    } catch (e: any) {
      if (isAxiosError(e)) {
        const err = e as AxiosError;
        this.logger.error(
          `Request failed ${err.code} ${err.status} ${err.response?.data}`,
        );
      } else this.logger.error(`Request failed ${e?.message}`);
    }

    return null;
  }

  async put<T = any>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
  ): Promise<T | null> {
    try {
      if (!data.appId && this.appId) data.appId = this.appId;
      if (!data.userId && this.userId) data.userId = this.userId;
      if (!data.sessionId && this.sessionId) data.sessionId = this.sessionId;

      const res = await this.getClient().put(url, data, config);
      return res.data as T;
    } catch (e: any) {
      if (isAxiosError(e)) {
        const err = e as AxiosError;
        this.logger.error(
          `Request failed ${err.code} ${err.status} ${err.response?.data}`,
        );
      } else this.logger.error(`Request failed ${e?.message}`);
    }

    return null;
  }

  async get<T = any>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<T | null> {
    try {
      const res = await this.getClient().get(url, config);
      return res.data as T;
    } catch (e: any) {
      if (isAxiosError(e)) {
        const err = e as AxiosError;
        this.logger.error(
          `Request failed ${err.code} ${err.status} ${err.response?.data}`,
        );
      } else this.logger.error(`Request failed ${e?.message}`);
    }
    return null;
  }

  async refreshToken() {
    const jwt = this.auth.getUserInfo();
    const data = {
      appId: this.appId,
      clientId: jwt?.azp,
    };
    return await this.post<JwtTokenDto>(`platform/token/refresh`, data);
  }

  async sendForceStop() {
    const appId = this.requireAppId();
    if (!appId) return null;
    const sessionId = this.requireSessionId();
    if (!sessionId) return null;

    return (
      (await this.post<void>(
        `dialogue/speech/stop/${appId}/${sessionId}`,
        {},
      )) || []
    );
  }

  async login(form: LoginRequestDto) {
    return await this.post<LoginResponseDto>(`auth/login`, form);
  }

  async whoAmI(token: string) {
    const headers = { Authorization: `Bearer ${token}` };
    return await this.get<AuthJwtUser>(`auth/whoami`, { headers });
  }

  async sendAudio(data: FormData, params?: { sampleRate?: number }) {
    const appId = this.requireAppId();
    if (!appId) return null;

    const sessionId = this.requireSessionId();
    if (!sessionId) return null;

    params = params || {};
    const qs = Object.keys(params)
      .reduce((arr: string[], key) => {
        if (!params || !params[key]) return arr;
        return [...arr, `${key}=${params[key]}`];
      }, [])
      .join('&');

    return (
      (await this.post<void>(
        `dialogue/speech/stt/${appId}/${sessionId}?${qs}`,
        data,
        { headers: { 'content-type': 'multipart/form-data' } },
      )) || []
    );
  }

  async sendChatMessage(data: DialogueMessageDto) {
    const appId = this.requireAppId();
    if (!appId) return null;
    const sessionId = this.requireSessionId();
    if (!sessionId) return null;

    return (
      (await this.post<void>(
        `dialogue/speech/chat/${appId}/${sessionId}`,
        data,
      )) || []
    );
  }

  async sendAgentHeartBeat(heartbit: AgentHeartBeatEventDto) {
    if (!heartbit.moduleId) return null;
    if (!heartbit.appId) return null;

    this.logger.log(
      `Sending heartbit status=${AgentStatus[heartbit.status]} for moduleId=${heartbit.moduleId}`,
    );
    await this.post<void>(`session/agent`, heartbit);
  }

  async listTopics(moduleId: string) {
    const appId = this.requireAppId();
    if (!appId) return null;
    return await this.get<string[]>(
      `platform/app/${appId}/client/${moduleId}/topics`,
    );
  }

  async listModels() {
    return await this.get<string[]>(`dialogue/speech/models`);
  }

  async interactionIntention(
    moduleId = 'avatar',
    source: UserReferenceSource,
    interactionType: InteractionType,
    sessionId: string | undefined,
  ) {
    const appId = this.requireAppId();
    if (!appId) return null;

    const payload: Partial<UserInteractionIntentionDto> = {
      appId,
      moduleId,
      source,
      sessionId,
      probability: 1,
      interactionType,
    };

    return await this.post<void>('detection/interaction', payload);
  }

  async mapBlendShapes(blendShapes: string[]): Promise<Record<string, string>> {
    if (!blendShapes || !blendShapes.length) return {};
    const payload: UIModelMapBlendShapesRequestDto = {
      blendShapes,
    };

    const res = await this.post<UIModelMapBlendShapesResponseDto>(
      'ui/model/map-blend-shapes',
      payload,
    );
    if (!res?.blendShapes) return {};
    return res?.blendShapes as Record<string, string>;
  }

  async getApp(appId?: string) {
    appId = appId || this.requireAppId();
    if (!appId) {
      this.logger.warn('getApp: no appId available');
      return null;
    }
    return await this.get<PlatformAppDto>(`app/${appId}`);
  }

  async getApps() {
    return await this.get<PlatformAppDto[]>(`app`);
  }

  async getAsset(type: string, assetId: string) {
    const appId = this.requireAppId();
    if (!appId) {
      this.logger.warn('getApp: no appId available');
      return null;
    }
    return await this.get<Blob>(`ui/asset/${appId}/${type}/${assetId}`, {
      responseType: 'blob',
    });
  }

  async getUserSession(appId?: string, token?: string) {
    appId = appId || this.requireAppId();
    if (!appId) {
      this.logger.warn('getApp: no appId available');
      return null;
    }
    return await this.get<SessionDto>(
      `session/user/${appId}`,
      !token
        ? undefined
        : {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
    );
  }

  async getRepositoryDefaults() {
    return await this.get<RepositoryConfigDto>(`app/repository/defaults`);
  }

  getSession(sessionId?: string) {
    return this.get<SessionDto>(`session/${sessionId}`);
  }

  updateSession(session: SessionDto) {
    return this.put(`session`, session);
  }

  async closeSession() {
    if (!this.sessionId) return;
    const session = await this.getSession(this.sessionId);
    if (session) {
      session.closedAt = new Date().toString();
      this.updateSession(session);
    }
  }

  saveRecord(record: DatasetRecordDto) {
    return this.post(`platform/monitoring`, record);
  }
}
