import { Injectable, Logger } from '@nestjs/common';
import { ScrapersService, SteamIndex } from '../scrapers/scrapers.service';
import { GamesService } from '../games/games.service';
import { PricesService } from '../prices/prices.service';
import { matchesQuery } from '../scrapers/relevance';
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly scrapers: ScrapersService,
    private readonly games: GamesService,
    private readonly prices: PricesService,
  ) {}

  /**
   * Prices already in the cache were saved before the relevance rule existed,
   * or under a looser one, so the same check runs on the way out. Otherwise a
   * search poisoned once keeps answering with other games until the cache
   * turns over.
   */
  private onlyThisGame<T extends { gameName: string }>(
    query: string,
    prices: T[],
  ): T[] {
    return prices.filter((p) => matchesQuery(query, p.gameName));
  }

  async search(query: string, page: number, limit: number) {
    const game = await this.games.findOrCreate(query);

    const cachedPrices = await this.prices.getCachedPrices(game.slug);
    let allPrices = cachedPrices
      ? this.onlyThisGame(query, cachedPrices)
      : null;

    if (!allPrices) {
      this.logger.log(`Cache miss for "${query}", scraping...`);
      const scrapedPrices = await this.scrapers.searchAll(query);
      allPrices = await this.prices.savePrices(game, scrapedPrices);
    } else {
      this.logger.log(`Cache hit for "${query}"`);
    }

    const total = allPrices.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedPrices = allPrices.slice((page - 1) * limit, page * limit);

    return {
      game,
      prices: paginatedPrices,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async searchFast(query: string, cc = 'us') {
    const game = await this.games.findOrCreate(query);

    const cached = await this.prices.getCachedPrices(game.slug);
    if (cached) {
      const relevant = this.onlyThisGame(query, cached);
      this.logger.log(
        `Stream cache hit for "${query}" (${relevant.length} of ${cached.length} prices)`,
      );
      return { game, prices: relevant, steamIndex: null };
    }

    this.logger.log(`Stream cache miss for "${query}", scraping...`);
    const { prices, steamIndex, errors } = await this.scrapers.searchFast(
      query,
      cc,
    );
    const savedPrices = await this.prices.savePrices(game, prices);
    return { game, prices: savedPrices, steamIndex, errors };
  }

  searchSlow(query: string, steamIndex: SteamIndex) {
    return this.scrapers.searchSlow(query, steamIndex);
  }

  async savePrices(
    game: { id: string; name: string; slug: string },
    scrapedPrices: import('../scrapers/interfaces/scraper.interface').ScrapedPrice[],
  ) {
    const gameEntity = await this.games.findOrCreate(game.name);
    return this.prices.savePrices(gameEntity, scrapedPrices);
  }

  async saveFailedStores(
    gameId: string,
    errors: { store: string; reason: string }[],
  ) {
    await this.games.updateFailedStores(gameId, errors);
  }
}
