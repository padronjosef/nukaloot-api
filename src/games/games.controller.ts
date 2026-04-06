import { Controller, Get, Query } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { GamesService, standardizeName } from './games.service';

interface FeaturedGame {
  name: string;
  id: number;
  header_image: string;
}

interface SteamAppDetails {
  content_descriptors?: { ids?: number[] };
  required_age?: number | string;
}

interface SteamAppDetailsResponse {
  [appId: string]: { data?: SteamAppDetails };
}

interface SteamFeaturedResponse {
  large_capsules?: FeaturedGame[];
  featured_win?: FeaturedGame[];
}

interface SteamTopSeller extends FeaturedGame {
  final_price: number;
  discount_percent: number;
}

interface SteamFeaturedCategoriesResponse {
  coming_soon?: { items?: FeaturedGame[] };
  new_releases?: { items?: FeaturedGame[] };
  top_sellers?: { items?: SteamTopSeller[] };
}

interface AxiosErrorLike {
  response?: { status?: number };
}

/**
 * Returns the most recent 1:00 PM Colombia time (UTC-5 = 18:00 UTC).
 * If now is before 18:00 UTC, returns yesterday's 18:00 UTC.
 */
function getLastRefreshTime(): Date {
  const now = new Date();
  const todayRefresh = new Date(now);
  todayRefresh.setUTCHours(18, 0, 0, 0);
  if (now >= todayRefresh) return todayRefresh;
  todayRefresh.setUTCDate(todayRefresh.getUTCDate() - 1);
  return todayRefresh;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: Date;
}

const cache: Record<string, CacheEntry<unknown>> = {};

function getCached<T>(key: string): T | null {
  const entry = cache[key];
  if (!entry) return null;
  const refreshTime = getLastRefreshTime();
  if (entry.fetchedAt >= refreshTime) return entry.data as T;
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache[key] = { data, fetchedAt: new Date() };
}

async function filterNsfw<T extends { appId: number }>(
  http: HttpService,
  games: T[],
): Promise<T[]> {
  const results: T[] = [];
  for (const game of games) {
    try {
      const { data } = await firstValueFrom(
        http.get<SteamAppDetailsResponse>(
          `https://store.steampowered.com/api/appdetails?appids=${game.appId}`,
          {
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          },
        ),
      );
      const app = data?.[String(game.appId)]?.data;
      if (!app) {
        results.push(game);
        continue;
      }
      const descriptors: number[] = app.content_descriptors?.ids || [];
      const isNsfw =
        descriptors.some((id: number) => id === 3 || id === 4) ||
        Number(app.required_age) >= 18;
      if (!isNsfw) results.push(game);
    } catch {
      results.push(game);
    }
  }
  return results;
}

@Controller('games')
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly http: HttpService,
  ) {}

  @Get()
  search(@Query('q') query: string) {
    return this.gamesService.search(query || '');
  }

  @Get('featured')
  async featured() {
    const cached = getCached<{
      items: {
        name: string;
        appId: number;
        image: string;
        finalPrice?: number;
        discountPercent?: number;
      }[];
      rateLimited?: boolean;
    }>('featured');
    if (cached) return cached;

    let data: SteamFeaturedResponse;
    try {
      const res = await firstValueFrom(
        this.http.get<SteamFeaturedResponse>(
          'https://store.steampowered.com/api/featured/?cc=us',
          {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          },
        ),
      );
      data = res.data;
    } catch (e: unknown) {
      const axiosErr = e as AxiosErrorLike;
      const status = axiosErr?.response?.status;
      if (status === 403 || status === 429) {
        return { rateLimited: true, items: [] };
      }
      return { items: [] };
    }

    const seen = new Set<number>();
    const candidates: {
      name: string;
      appId: number;
      image: string;
      finalPrice?: number;
      discountPercent?: number;
    }[] = [];
    for (const fg of [
      ...(data.large_capsules || []),
      ...(data.featured_win || []),
    ]) {
      if (!fg.name || !fg.id || seen.has(fg.id)) continue;
      seen.add(fg.id);
      const seller = fg as unknown as SteamTopSeller;
      candidates.push({
        name: standardizeName(fg.name),
        appId: fg.id,
        image: fg.header_image,
        finalPrice: seller.final_price ? seller.final_price / 100 : undefined,
        discountPercent: seller.discount_percent || undefined,
      });
    }

    const items = await filterNsfw(this.http, candidates);
    const result = { items };
    setCache('featured', result);
    return result;
  }

  @Get('upcoming')
  async upcoming() {
    const cached = getCached<{
      items: { name: string; appId: number; image: string; url: string }[];
      rateLimited?: boolean;
    }>('upcoming');
    if (cached) return cached;

    let data: SteamFeaturedCategoriesResponse;
    try {
      const res = await firstValueFrom(
        this.http.get<SteamFeaturedCategoriesResponse>(
          'https://store.steampowered.com/api/featuredcategories/?cc=us&l=en',
          { headers: { 'User-Agent': 'Mozilla/5.0' } },
        ),
      );
      data = res.data;
    } catch (e: unknown) {
      const axiosErr = e as AxiosErrorLike;
      const status = axiosErr?.response?.status;
      if (status === 403 || status === 429) {
        return { rateLimited: true, items: [] };
      }
      return { items: [] };
    }

    const comingSoon = data?.coming_soon?.items || [];
    const newReleases = data?.new_releases?.items || [];
    const seen = new Set<number>();

    const candidates: {
      name: string;
      appId: number;
      image: string;
      url: string;
    }[] = [];
    for (const item of [...comingSoon, ...newReleases]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      candidates.push({
        name: standardizeName(item.name),
        appId: item.id,
        image: item.header_image,
        url: `https://store.steampowered.com/app/${item.id}`,
      });
    }

    const filtered = await filterNsfw(this.http, candidates);
    const result = { items: filtered.slice(0, 12) };
    setCache('upcoming', result);
    return result;
  }

  @Get('top-sellers')
  async topSellers() {
    const cached = getCached<{
      items: { name: string; appId: number; image: string; url: string }[];
      rateLimited?: boolean;
    }>('top-sellers');
    if (cached) return cached;

    let data: SteamFeaturedCategoriesResponse;
    try {
      const res = await firstValueFrom(
        this.http.get<SteamFeaturedCategoriesResponse>(
          'https://store.steampowered.com/api/featuredcategories/?cc=us&l=en',
          { headers: { 'User-Agent': 'Mozilla/5.0' } },
        ),
      );
      data = res.data;
    } catch (e: unknown) {
      const axiosErr = e as AxiosErrorLike;
      const status = axiosErr?.response?.status;
      if (status === 403 || status === 429) {
        return { rateLimited: true, items: [] };
      }
      return { items: [] };
    }

    const topSellers = data?.top_sellers?.items || [];
    const seen = new Set<number>();

    const candidates: {
      name: string;
      appId: number;
      image: string;
      url: string;
    }[] = [];
    for (const item of topSellers) {
      if (seen.has(item.id) || item.final_price === 0) continue;
      seen.add(item.id);
      candidates.push({
        name: standardizeName(item.name),
        appId: item.id,
        image: item.header_image,
        url: `https://store.steampowered.com/app/${item.id}`,
      });
    }

    const filtered = await filterNsfw(this.http, candidates);
    const result = { items: filtered.slice(0, 12) };
    setCache('top-sellers', result);
    return result;
  }
}
