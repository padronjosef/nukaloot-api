import { Injectable, Logger } from '@nestjs/common';
import { GameScraper, ScrapedPrice } from '../interfaces/scraper.interface';

const KINGUIN_API =
  'https://www.kinguin.net/services/library/api/v1/products/search';

interface KinguinProduct {
  name: string;
  externalId: string;
  price?: {
    lowestOffer?: number;
    market?: number;
  };
  coverImageUrl?: string;
  hiImageUrl?: string;
  imageUrl?: string;
  active?: boolean;
  visible?: boolean;
  attributes?: {
    releaseDate?: string;
    marketingProductType?: string;
    urlKey?: string;
  };
}

interface KinguinResponse {
  _embedded?: {
    products?: KinguinProduct[];
  };
}

@Injectable()
export class KinguinScraper implements GameScraper {
  readonly storeName = 'Kinguin';
  private readonly logger = new Logger(KinguinScraper.name);

  async search(query: string): Promise<ScrapedPrice[]> {
    try {
      const url = `${KINGUIN_API}?phrase=${encodeURIComponent(query)}&size=40&page=0`;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        this.logger.warn(`Kinguin API returned ${res.status}`);
        return [];
      }

      const data = (await res.json()) as KinguinResponse;
      const products: KinguinProduct[] = data?._embedded?.products || [];

      const EXCLUDED_TYPES = new Set([
        'game_account',
        'ingame_account',
        'ingame_currency',
        'ingame_item',
        'altergift',
      ]);

      return products
        .filter((p) => {
          const mpt = (p.attributes?.marketingProductType || '').toLowerCase();
          return (
            p.active !== false &&
            p.visible !== false &&
            p.price?.lowestOffer &&
            p.price.lowestOffer > 0 &&
            !EXCLUDED_TYPES.has(mpt)
          );
        })
        .map((p) => {
          const price = (p.price?.lowestOffer || 0) / 100;
          const originalPrice = p.price?.market
            ? p.price.market / 100
            : undefined;

          let gameType: 'game' | 'dlc' | 'bundle' | 'other' = 'other';
          const mpt = (p.attributes?.marketingProductType || '').toLowerCase();
          const nameLower = p.name.toLowerCase();
          if (mpt.includes('dlc') || nameLower.includes('dlc'))
            gameType = 'dlc';
          else if (
            mpt.includes('bundle') ||
            nameLower.includes('bundle') ||
            nameLower.includes('pack')
          )
            gameType = 'bundle';
          else if (mpt === 'game' || mpt === 'game_key' || mpt === '')
            gameType = 'game';

          const urlKey =
            p.attributes?.urlKey ||
            p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          return {
            storeName: this.storeName,
            storeUrl: 'https://www.kinguin.net',
            gameName: p.name,
            price,
            originalPrice,
            currency: 'EUR',
            productUrl: `https://www.kinguin.net/category/${p.externalId}/${urlKey}`,
            gameType,
            imageUrl: p.coverImageUrl || p.hiImageUrl || p.imageUrl || '',
            backgroundUrl: '',
            releaseDate: p.attributes?.releaseDate || '',
          };
        });
    } catch (error: unknown) {
      this.logger.error(
        `Kinguin search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }
}
