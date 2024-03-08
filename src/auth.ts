import Keycloak from 'keycloak-js';
import { Logger, logger } from './logger';
import { AuthJwtUser, JwtTokenDto } from '@sermas/api-client';

export interface AuthClientOptions {
  authUrl: string;
  authRealm: string;
  authClientId: string;
  tokenMinValidity?: number;
  refreshToken?: () => Promise<JwtTokenDto | null>;
}

export const parseJWT = (token?: string): AuthJwtUser | undefined => {
  if (!token) return undefined;
  try {
    return JSON.parse(atob(token.split('.')[1])) as AuthJwtUser;
  } catch (e: any) {
    logger.warn(`failed to parse JWT: ${e.message}`);
  }
  return undefined;
};

export class AuthToken {
  private token?: string;
  private userInfo: AuthJwtUser | undefined;

  constructor(token?: string) {
    this.set(token);
  }

  clear() {
    this.token = undefined;
    this.userInfo = undefined;
  }
  set(token?: string) {
    if (!token) {
      return this.clear();
    }
    this.token = token;
    this.userInfo = parseJWT(this.token);
  }
  getToken() {
    return this.token;
  }
  getUserInfo() {
    return this.userInfo;
  }
}

export class AuthClient {
  private readonly logger = new Logger('auth');

  private kc: Keycloak | undefined;

  constructor(private readonly options: AuthClientOptions) {}

  private readonly auth = new AuthToken();

  private refreshTokenTimeout?: NodeJS.Timeout;

  getUserInfo() {
    return this.auth.getUserInfo();
  }

  getKeycloak() {
    return this.kc;
  }

  async initAuth() {
    this.kc = new Keycloak({
      url: this.options.authUrl,
      realm: this.options.authRealm,
      clientId: this.options.authClientId,
    });

    // const logged_in = await kc.init({ onLoad: "check-sso" })
    const logged_in = await this.kc.init({ onLoad: 'login-required' });
    if (logged_in) {
      this.logger.debug(`User is already logged-in`);
      this.setToken(this.kc?.token);
      return;
    }

    this.clearToken();
  }

  clearToken() {
    this.auth.clear();
  }

  setToken(token?: string) {
    this.auth.set(token);
  }

  //redirect to logout if token is expired
  isExpired() {
    if (!this.kc?.isTokenExpired()) return false;
    this.logger.log('token expired');
    this.clearToken();
    this.kc?.logout();
    return true;
  }

  private async refreshKeycloackToken(): Promise<void> {
    this.logger.log('refresh token');
    const refreshed = await this.kc?.updateToken(
      this.options.tokenMinValidity || 60,
    );

    if (refreshed) {
      this.logger.log('token refreshed');
      this.setToken(this.kc?.token);
      return;
    }

    this.isExpired();
  }

  async refreshToken(): Promise<Partial<JwtTokenDto> | null> {
    if (this.options.refreshToken) {
      return await this.options.refreshToken();
    }

    await this.refreshKeycloackToken();
    const token = this.auth.getToken();
    if (!token) return null;
    const jwt = this.auth.getUserInfo();
    if (!jwt?.exp) return null;

    return {
      access_token: token,
      expires_in: jwt.exp,
    };
  }

  registerRefreshTokenTimeout(expiresIn: Date | undefined) {
    if (!expiresIn) return;

    if (this.refreshTokenTimeout) {
      clearTimeout(this.refreshTokenTimeout);
    }

    const refreshIn = new Date(expiresIn).getTime() - Date.now() - 60 * 1000;
    this.logger.log(
      `Refreshing token in ${Math.round(refreshIn / 60 / 1000)}s`,
    );

    this.refreshTokenTimeout = setTimeout(async () => {
      this.logger.log(`refreshing token`);
      try {
        const res = await this.refreshToken();
        this.setToken(res?.access_token);
        if (res?.expires_in) {
          const expiresIn2 = new Date(Date.now() + res?.expires_in * 1000);
          this.logger.log(`next token refresh at ${expiresIn2}`);
          this.registerRefreshTokenTimeout(expiresIn2);
        }
      } catch (e: any) {
        this.logger.error(`Failed to refresh token: ${e.message}`);
      }
    }, refreshIn);
  }
}
