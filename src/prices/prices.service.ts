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
    const since = getLastRefreshTime();

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

  async savePrices(
    game: Game,
    scrapedPrices: ScrapedPrice[],
  ): Promise<Price[]> {
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
        existing.imageUrl = sp.imageUrl;
        existing.backgroundUrl = sp.backgroundUrl;
        existing.releaseDate = sp.releaseDate;
        existing.scrapedAt = new Date();
        await this.priceRepo.save(existing);
      } else {
        const price = this.priceRepo.create({
          price: sp.price,
          originalPrice: sp.originalPrice,
          currency: sp.currency,
          productUrl: sp.productUrl,
          gameName: sp.gameName,
          gameType: sp.gameType,
          imageUrl: sp.imageUrl,
          backgroundUrl: sp.backgroundUrl,
          releaseDate: sp.releaseDate,
          game,
          store,
        });
        await this.priceRepo.save(price);
      }
    }

    return this.priceRepo.find({
      where: { game: { id: game.id } },
      relations: ['store', 'game'],
      order: { price: 'ASC' },
    });
  }
}
