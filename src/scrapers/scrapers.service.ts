import { Injectable, Logger } from '@nestjs/common';
import { SteamScraper } from './providers/steam.scraper';
import { CheapSharkScraper } from './providers/cheapshark.scraper';
import { InstantGamingScraper } from './providers/instantgaming.scraper';
import { GameType, ScrapedPrice } from './interfaces/scraper.interface';
import { standardizeName } from '../games/games.service';

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const BUNDLE_KEYWORDS = [
  'bundle',
  'pack',
  'collection',
  'complete edition',
  'definitive edition',
  'ultimate edition',
  'goty',
  'game of the year',
  'deluxe edition',
  'gold edition',
  'premium edition',
  'season pass',
  'franchise',
  'anthology',
];

function inferGameType(name: string): GameType | null {
  const lower = name.toLowerCase();
  if (BUNDLE_KEYWORDS.some((kw) => lower.includes(kw))) return 'bundle';
  return null;
}

export interface SteamIndex {
  map: Map<
    string,
    {
      gameType: GameType;
      gameName: string;
      imageUrl: string;
      backgroundUrl: string;
      releaseDate: string;
    }
  >;
}

@Injectable()
export class ScrapersService {
  private readonly logger = new Logger(ScrapersService.name);

  constructor(
    private readonly steam: SteamScraper,
    private readonly cheapShark: CheapSharkScraper,
    private readonly instantGaming: InstantGamingScraper,
  ) {}

  /**
   * Fast search: Steam + CheapShark (API-based, <2s)
   * Returns results + steam index for enriching slow results later
   */
  async searchFast(
    query: string,
    cc = 'us',
  ): Promise<{ prices: ScrapedPrice[]; steamIndex: SteamIndex }> {
    this.logger.log(`Fast search for: "${query}" (region: ${cc})`);

    const results = await Promise.allSettled([
      this.steam.search(query, cc),
      this.cheapShark.search(query),
    ]);

    let steamPrices: ScrapedPrice[] = [];
    let cheapSharkPrices: ScrapedPrice[] = [];

    if (results[0].status === 'fulfilled') {
      steamPrices = results[0].value;
    } else {
      this.logger.warn(`Steam scraper failed: ${results[0].reason}`);
    }

    if (results[1].status === 'fulfilled') {
      cheapSharkPrices = results[1].value;
    } else {
      this.logger.warn(`CheapShark scraper failed: ${results[1].reason}`);
    }

    // Build Steam index (source of truth)
    const steamIndex: SteamIndex = { map: new Map() };
    for (const sp of steamPrices) {
      sp.gameName = standardizeName(sp.gameName);
      steamIndex.map.set(normalize(sp.gameName), {
        gameType: sp.gameType,
        gameName: sp.gameName,
        imageUrl: sp.imageUrl,
        backgroundUrl: sp.backgroundUrl,
        releaseDate: sp.releaseDate,
      });
    }

    // Enrich CheapShark with Steam data
    const matchedCheapShark = this.enrichWithSteamData(
      cheapSharkPrices,
      steamIndex,
    );

    const prices = [...steamPrices, ...matchedCheapShark];
    return { prices: this.deduplicateAndSort(prices), steamIndex };
  }

  /**
   * Slow search: Playwright-based scrapers (5-15s each)
   * Yields results one by one as they complete
   */
  async *searchSlow(
    query: string,
    steamIndex: SteamIndex,
  ): AsyncGenerator<ScrapedPrice[]> {
    const slowScrapers = [
      { name: 'Instant Gaming', scraper: this.instantGaming },
    ];

    for (const { name, scraper } of slowScrapers) {
      try {
        this.logger.log(`Slow scraping: ${name}...`);
        const results = await scraper.search(query);
        const enriched = this.enrichWithSteamData(results, steamIndex);
        if (enriched.length > 0) {
          yield enriched;
        }
      } catch (error: unknown) {
        this.logger.error(
          `${name} scraper failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  /**
   * Legacy method: all at once (for cached results)
   */
  async searchAll(query: string): Promise<ScrapedPrice[]> {
    const { prices } = await this.searchFast(query);
    return prices;
  }

  private enrichWithSteamData(
    prices: ScrapedPrice[],
    steamIndex: SteamIndex,
  ): ScrapedPrice[] {
    const matched: ScrapedPrice[] = [];

    for (const p of prices) {
      if (p.gameType !== 'unknown') {
        matched.push(p);
        continue;
      }

      const normalized = normalize(p.gameName);

      // Exact match
      const exact = steamIndex.map.get(normalized);
      if (exact) {
        p.gameType = exact.gameType;
        p.gameName = exact.gameName;
        if (exact.imageUrl) p.imageUrl = exact.imageUrl;
        if (exact.backgroundUrl) p.backgroundUrl = exact.backgroundUrl;
        p.releaseDate = exact.releaseDate;
        matched.push(p);
        continue;
      }

      // Partial match: find the LONGEST Steam name contained in the IG name
      // This ensures "Dark Souls II Crown of the Sunken King" matches the DLC entry
      // instead of the base game "Dark Souls II"
      let bestMatch: {
        steamNorm: string;
        data: {
          gameType: GameType;
          gameName: string;
          imageUrl: string;
          backgroundUrl: string;
          releaseDate: string;
        };
      } | null = null;

      for (const [steamNorm, steamData] of steamIndex.map) {
        const isContained =
          normalized.includes(steamNorm) || steamNorm.includes(normalized);
        if (isContained) {
          if (!bestMatch || steamNorm.length > bestMatch.steamNorm.length) {
            bestMatch = { steamNorm, data: steamData };
          }
        }
      }

      if (bestMatch && bestMatch.data) {
        p.gameType = bestMatch.data.gameType;
        p.gameName = bestMatch.data.gameName;
        if (bestMatch.data.imageUrl) p.imageUrl = bestMatch.data.imageUrl;
        if (bestMatch.data.backgroundUrl)
          p.backgroundUrl = bestMatch.data.backgroundUrl;
        p.releaseDate = bestMatch.data.releaseDate;
      }
      matched.push(p);
    }

    for (const p of matched) {
      if (p.gameType === 'unknown' || p.gameType === 'game') {
        const inferred = inferGameType(p.gameName);
        if (inferred) p.gameType = inferred;
      }
    }

    return this.deduplicateAndSort(matched);
  }

  private deduplicateAndSort(prices: ScrapedPrice[]): ScrapedPrice[] {
    const bestByStore = new Map<string, ScrapedPrice>();
    for (const p of prices) {
      p.gameName = standardizeName(p.gameName);
      const key = `${p.storeName}:${normalize(p.gameName)}`;
      const existing = bestByStore.get(key);
      if (!existing || p.price < existing.price) {
        bestByStore.set(key, p);
      }
    }
    return Array.from(bestByStore.values()).sort((a, b) => a.price - b.price);
  }
}
