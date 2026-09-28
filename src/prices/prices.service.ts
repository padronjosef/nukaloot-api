import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Price, Store, Game } from '../entities';
import { ScrapedPrice } from '../scrapers/interfaces/scraper.interface';

/**
 * Returns the most recent 1:00 PM Colombia time (UTC-5) as a Date.
 * If it's currently before 1:00 PM COT today, returns yesterday's 1:00 PM COT.
 * This is the "cache boundary" — prices scraped after this time are considered fresh.
 */
/**
 * Prices saved before this instant came out of an older pipeline and are
 * incomplete — console listings were discarded at scrape time and store
 * recommendations were kept — so a cached set from before it says a game is
 * PC-only when it is not, and carries other games' listings besides.
 *
 * Treating them as stale costs one re-scrape per game instead of serving
 * wrong data until the daily boundary passes. Set PRICE_CACHE_EPOCH to an ISO
 * timestamp to do the same again after the next pipeline change.
 */
function getPipelineEpoch(): Date | null {
  const raw = process.env.PRICE_CACHE_EPOCH ?? '2026-09-19T04:10:00Z';
  const parsed = new Date(raw);
  // An unreadable value must not invalidate the whole cache, which would mean
  // re-scraping every game on every search.
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLastRefreshTime(): Date {
  const now = new Date();
  // 1:00 PM Colombia = 18:00 UTC
  const todayRefresh = new Date(now);
  todayRefresh.setUTCHours(18, 0, 0, 0);

  if (now >= todayRefresh) {
    return todayRefresh;
  }
  // Before today's refresh → use yesterday's
  todayRefresh.setUTCDate(todayRefresh.getUTCDate() - 1);
  return todayRefresh;
}

@Injectable()
export class PricesService {
  constructor(
    @InjectRepository(Price)
    private readonly priceRepo: Repository<Price>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(Game)
    private readonly gameRepo: Repository<Game>,
  ) {}

  async getCachedPrices(gameSlug: string): Promise<Price[] | null> {
    const epoch = getPipelineEpoch();
    const refresh = getLastRefreshTime();
    // Whichever boundary is later. The epoch only ever makes the cache
    // shorter, never longer.
    const since = epoch && epoch > refresh ? epoch : refresh;

    const prices = await this.priceRepo.find({
      where: {
        game: { slug: gameSlug },
        scrapedAt: MoreThan(since),
      },
      relations: ['store', 'game'],
      order: { price: 'ASC' },
    });

    return prices.length > 0 ? prices : null;
  }

  /**
   * Saves this scrape and returns *this scrape*, not every row ever attached
   * to the game. The table still holds older rows — a listing that vanished
   * from a store, or one saved by a looser pipeline — and returning those
   * would put games nobody searched for back on the page right after the
   * filtering that removed them.
   */
  async savePrices(
    game: Game,
    scrapedPrices: ScrapedPrice[],
  ): Promise<Price[]> {
    const saved: Price[] = [];

    for (const sp of scrapedPrices) {
      let store = await this.storeRepo.findOne({
        where: { name: sp.storeName },
      });

      if (!store) {
        store = this.storeRepo.create({
          name: sp.storeName,
          url: sp.storeUrl,
        });
        store = await this.storeRepo.save(store);
      }

      // Upsert: find existing price by game + store + productUrl
      const existing = await this.priceRepo.findOne({
        where: {
          game: { id: game.id },
          store: { id: store.id },
          productUrl: sp.productUrl,
        },
      });

      if (existing) {
        existing.price = sp.price;
        existing.originalPrice = sp.originalPrice as number;
        existing.currency = sp.currency;
        existing.gameName = sp.gameName;
        existing.gameType = sp.gameType;
        existing.platform = sp.platform ?? 'pc';
        existing.imageUrl = sp.imageUrl;
        existing.backgroundUrl = sp.backgroundUrl;
        existing.releaseDate = sp.releaseDate;
        existing.scrapedAt = new Date();
        saved.push(await this.priceRepo.save(existing));
      } else {
        const price = this.priceRepo.create({
          price: sp.price,
          originalPrice: sp.originalPrice,
          currency: sp.currency,
          productUrl: sp.productUrl,
          gameName: sp.gameName,
          gameType: sp.gameType,
          platform: sp.platform ?? 'pc',
          imageUrl: sp.imageUrl,
          backgroundUrl: sp.backgroundUrl,
          releaseDate: sp.releaseDate,
          game,
          store,
        });
        saved.push(await this.priceRepo.save(price));
      }
    }

    await this.rememberCover(game, saved);

    return saved.sort((a, b) => Number(a.price) - Number(b.price));
  }

  /**
   * Games are created from a search term and start with no artwork, so every
   * list that shows one — favourites, and the tracker's notifications later —
   * draws a placeholder forever. The listings carry the image; the first one
   * that has it lends it to the game, once.
   */
  private async rememberCover(game: Game, saved: Price[]): Promise<void> {
    if (game.coverUrl) return;

    const cover = saved.find((p) => p.imageUrl)?.imageUrl;
    if (!cover) return;

    game.coverUrl = cover;
    // Not worth failing a search over: the prices are the answer, the picture
    // is decoration.
    await this.gameRepo
      .update({ id: game.id }, { coverUrl: cover })
      .catch(() => {});
  }
}
