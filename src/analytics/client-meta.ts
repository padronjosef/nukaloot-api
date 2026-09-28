import type { Request } from 'express';
import type { ClientMeta } from './analytics.service';

const first = (value?: string | string[]): string | null => {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw.split(',')[0].trim() || null;
};

/**
 * The visitor's real IP and country never reach this service directly — the
 * request arrives from the web container. Next.js forwards what it saw as
 * `x-client-*`; the rest is a fallback for direct calls in dev.
 */
export const clientMetaFrom = (req: Request): ClientMeta => ({
  ip:
    first(req.headers['x-client-ip']) ||
    first(req.headers['cf-connecting-ip']) ||
    first(req.headers['x-forwarded-for']) ||
    req.ip ||
    null,
  country:
    first(req.headers['x-client-country']) ||
    first(req.headers['cf-ipcountry']) ||
    null,
  city: first(req.headers['x-client-city']) || null,
  region: first(req.headers['x-client-region']) || null,
  userAgent:
    (req.headers['x-client-user-agent'] as string) ||
    (req.headers['user-agent'] as string) ||
    null,
  referer:
    (req.headers['x-client-referer'] as string) ||
    (req.headers['referer'] as string) ||
    null,
  // Read from the session cookie by the web, never sent by the browser.
  userId: first(req.headers['x-client-user-id']),
});
