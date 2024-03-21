import { parseJWT } from './auth.js';
import { UserLoginResponseDto } from './dto.js';
import { SermasToolkit } from './index.js';

const LOCAL_STORAGE_KEY = 'sermas.current-user';

export class UserAuth {
  private currentUser: UserLoginResponseDto | undefined;

  constructor(private readonly toolkit: SermasToolkit) {}

  getCurrentUser() {
    return this.currentUser?.user;
  }

  getToken() {
    return this.currentUser?.token?.access_token;
  }

  private setUser(user: UserLoginResponseDto) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));
  }

  private removeUser() {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }

  private getUser(): UserLoginResponseDto | undefined {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    try {
      const user = JSON.parse(raw);
      if (!user) return;
      return user as UserLoginResponseDto;
    } catch {}
  }

  async isLoginRequired(): Promise<boolean> {
    const appRequiresLogin = await this.appRequiresLogin();
    if (!appRequiresLogin) return false;

    const user = await this.loadUser();
    if (!user) return true;

    return false;
  }

  async appRequiresLogin() {
    const app = await this.toolkit.getApp();
    if (!app) return false;

    if (!app?.settings?.login) return false;

    return true;
  }

  async loadUser() {
    const currentUser = await this.getUser();
    if (!currentUser) return undefined;

    // Check if token is expired
    const tokenExp = currentUser.user?.exp;
    const now = Math.floor(Date.now() / 1000);
    if (tokenExp < now) {
      await this.logout();
      return undefined;
    }

    this.currentUser = currentUser;
    this.toolkit.setUserId(this.currentUser.user.sub);

    return currentUser;
  }

  async logout() {
    this.currentUser = undefined;
    this.toolkit.setUserId(undefined);
    await this.removeUser();
  }

  async login(params: {
    username: string;
    password: string;
    appId?: string;
  }): Promise<UserLoginResponseDto | null> {
    const token = await this.toolkit.getApi().login({
      ...params,
      appId: params.appId || this.toolkit.getAppId(),
    });
    if (token === null) return null;

    const user = parseJWT(token.access_token);
    if (!user) return null;

    this.currentUser = {
      token,
      user,
    };

    await this.setUser(this.currentUser);
    this.toolkit.setUserId(this.currentUser.user.sub);
    return this.currentUser;
  }
}
