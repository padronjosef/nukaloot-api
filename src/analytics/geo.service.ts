import { Injectable, Logger } from '@nestjs/common';

type GeoResult = {
  country: string | null;
  city: string | null;
  region: string | null;
};

const EMPTY: GeoResult = { country: null, city: null, region: null };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 2000;

/**
 * Resolves an IP to a country. In production Cloudflare already sends the
 * country on every request, so this only runs where that header is absent
 * (local dev, or a request that bypassed the proxy).
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly cache = new Map<string, { value: GeoResult; at: number }>();

  private get enabled(): boolean {
    return process.env.GEO_FALLBACK_ENABLED !== 'false';
  }

  async lookup(ip: string | null): Promise<GeoResult> {
    if (!ip || !this.enabled || this.isPrivate(ip)) return EMPTY;

    const cached = this.cache.get(ip);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
      const res = await fetch(
        `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
        {
          signal: controller.signal,
          headers: { 'User-Agent': 'nukaloot/1.0' },
        },
      );
      clearTimeout(timer);

      if (!res.ok) return this.remember(ip, EMPTY);

      const data = (await res.json()) as {
        country_code?: string;
        city?: string;
        region?: string;
        error?: boolean;
      };
      if (data.error) return this.remember(ip, EMPTY);

      return this.remember(ip, {
        country: data.country_code?.toUpperCase() || null,
        city: data.city || null,
        region: data.region || null,
      });
    } catch (err) {
      this.logger.debug(`Geo lookup failed for ${ip}: ${String(err)}`);
      return this.remember(ip, EMPTY);
    }
  }

  private remember(ip: string, value: GeoResult): GeoResult {
    this.cache.set(ip, { value, at: Date.now() });
    return value;
  }

  private isPrivate(ip: string): boolean {
    return (
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('172.17.') ||
      ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') ||
      ip.startsWith('172.2') ||
      ip.startsWith('172.30.') ||
      ip.startsWith('172.31.') ||
      ip.startsWith('fc') ||
      ip.startsWith('fd')
    );
  }
}
