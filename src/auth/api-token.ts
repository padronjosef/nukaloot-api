import { createHmac, timingSafeEqual } from 'crypto';

export type ApiTokenClaims = {
  iss: string;
  /** The signed-in user this call acts for. Absent on service calls. */
  sub?: string;
  iat: number;
  exp: number;
};

const ISSUER = 'nukaloot-web';

const base64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url');

const secret = (): string => {
  const value = process.env.API_JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('API_JWT_SECRET must be set to at least 32 characters');
  }
  return value;
};

const sign = (data: string): string =>
  createHmac('sha256', secret()).update(data).digest('base64url');

/**
 * A compact HS256 token, verified here rather than trusted. The identity the
 * call acts for lives inside the signature, so a caller holding the token
 * cannot swap it for somebody else's — which a plain shared secret plus an
 * `x-actor-id` header allowed.
 */
export const verifyApiToken = (token: string): ApiTokenClaims | null => {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;

  const expected = sign(`${header}.${payload}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as ApiTokenClaims;

    if (claims.iss !== ISSUER) return null;
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;

    return claims;
  } catch {
    return null;
  }
};

/** Only used by the tests; the web is what mints these in practice. */
export const signApiToken = (sub?: string, ttlSeconds = 120): string => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ iss: ISSUER, sub, iat: now, exp: now + ttlSeconds }),
  );

  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
};
