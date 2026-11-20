import { AuthClient } from './auth.js';

const b64 = (o: object) =>
  btoa(JSON.stringify(o))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
const jwt = (payload: object) => `${b64({ alg: 'none' })}.${b64(payload)}.sig`;

describe('AuthClient.refreshToken', () => {
  it('returns seconds until expiry, not the expiry time', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const token = jwt({ exp, sub: 'u1' });
    const auth = new AuthClient({
      authUrl: 'x',
      authRealm: 'r',
      authClientId: 'c',
    });
    (auth as any).kc = { updateToken: async () => true, token };

    const res = await auth.refreshToken();

    expect(res?.access_token).toBe(token);
    expect(res?.expires_in).toBeGreaterThan(290);
    expect(res?.expires_in).toBeLessThanOrEqual(300);
  });
});
