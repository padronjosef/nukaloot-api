import { signApiToken, verifyApiToken } from './api-token';

const SECRET = 'a-secret-that-is-at-least-32-characters';

describe('api token', () => {
  beforeEach(() => {
    process.env.API_JWT_SECRET = SECRET;
  });

  it('accepts one it just signed', () => {
    const claims = verifyApiToken(signApiToken('user-1'));
    expect(claims?.sub).toBe('user-1');
  });

  it('carries no actor when signed without one', () => {
    expect(verifyApiToken(signApiToken())?.sub).toBeUndefined();
  });

  describe('what it must refuse', () => {
    it('refuses a token signed with a different secret', () => {
      const token = signApiToken('user-1');
      process.env.API_JWT_SECRET = 'a-different-secret-of-at-least-32-chars';
      expect(verifyApiToken(token)).toBeNull();
    });

    it('refuses an expired token', () => {
      expect(verifyApiToken(signApiToken('user-1', -1))).toBeNull();
    });

    it('refuses a token whose payload was edited', () => {
      // Swapping the actor is the attack this guards: holding a valid token
      // must not let anyone act as somebody else.
      const [header, payload, signature] = signApiToken('user-1').split('.');
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      claims.sub = 'someone-else';

      const forged = Buffer.from(JSON.stringify(claims)).toString('base64url');
      expect(verifyApiToken(`${header}.${forged}.${signature}`)).toBeNull();
    });

    it('refuses the classic "alg: none" forgery', () => {
      const header = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'nukaloot-web',
          sub: 'user-1',
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      ).toString('base64url');

      expect(verifyApiToken(`${header}.${payload}.`)).toBeNull();
    });

    it('refuses a token issued by something else', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({ iss: 'somebody-else', exp: 9999999999 }),
      ).toString('base64url');

      expect(verifyApiToken(`${header}.${payload}.whatever`)).toBeNull();
    });

    it.each(['', 'nonsense', 'only.two', 'a.b.c.d'])(
      'refuses the malformed %p',
      (token) => {
        expect(verifyApiToken(token)).toBeNull();
      },
    );

    it('refuses to work at all without a strong secret', () => {
      process.env.API_JWT_SECRET = 'short';
      expect(() => signApiToken('user-1')).toThrow();
    });
  });
});
