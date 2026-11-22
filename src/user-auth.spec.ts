import { UserAuth } from './user-auth.js';

const withUser = (user: unknown) => {
  const auth = new UserAuth({} as any);
  (auth as any).currentUser = user ? { user, token: {} } : undefined;
  return auth;
};

describe('UserAuth.isAdmin', () => {
  it('is true for a platform admin', () => {
    expect(
      withUser({
        realm_access: { roles: ['user', 'platform-admin'] },
      }).isAdmin(),
    ).toBe(true);
  });

  it('is false for other users and without a login', () => {
    expect(withUser({ realm_access: { roles: ['user'] } }).isAdmin()).toBe(
      false,
    );
    expect(withUser({ sub: 'u1' }).isAdmin()).toBe(false);
    expect(withUser(undefined).isAdmin()).toBe(false);
  });
});
