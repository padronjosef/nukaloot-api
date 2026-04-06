import { Injectable, Logger } from '@nestjs/common';
import { GameScraper, ScrapedPrice } from '../interfaces/scraper.interface';

const ALGOLIA_APP_ID = 'IHJZQ5LW2R';
const ALGOLIA_API_KEY = '53864095e814940ffed0f69a897331f1';
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries`;

interface AlgoliaHit {
  slug: string;
  translations?: Record<string, { name?: string }>;
  lowestPrice?: Record<string, number>;
  msrp?: Record<string, number>;
  images?: { cover300?: { src?: string } };
  productType?: string;
}

interface AlgoliaResponse {
  results?: Array<{ hits?: AlgoliaHit[] }>;
}

@Injectable()
export class EnebaScraper implements GameScraper {
  readonly storeName = 'Eneba';
  private readonly logger = new Logger(EnebaScraper.name);

  async search(query: string): Promise<ScrapedPrice[]> {
    try {
      const res = await fetch(ALGOLIA_URL, {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': ALGOLIA_APP_ID,
          'X-Algolia-API-Key': ALGOLIA_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              indexName: 'products_global',
              query,
              hitsPerPage: 40,
            },
          ],
        }),
      });

      if (!res.ok) {
        this.logger.warn(`Eneba Algolia returned ${res.status}`);
        return [];
      }

      const data = (await res.json()) as AlgoliaResponse;
      const hits: AlgoliaHit[] = data?.results?.[0]?.hits || [];

      return hits
        .filter((h) => h.lowestPrice?.USD && h.lowestPrice.USD > 0)
        .map((h) => {
          const name =
            h.translations?.en_US?.name ||
            h.translations?.en_GB?.name ||
            Object.values(h.translations || {})[0]?.name ||
            h.slug;
          const priceUsd = (h.lowestPrice?.USD || 0) / 100;
          const originalPriceUsd = h.msrp?.USD ? h.msrp.USD / 100 : undefined;

          let gameType: 'game' | 'dlc' | 'bundle' | 'other' = 'other';
          const pt = h.productType?.toLowerCase() || '';
          if (pt.includes('dlc')) gameType = 'dlc';
          else if (pt.includes('bundle') || pt.includes('pack'))
            gameType = 'bundle';
          else if (pt.includes('game') || pt.includes('key')) gameType = 'game';

          return {
            storeName: this.storeName,
            storeUrl: 'https://www.eneba.com',
            gameName: name,
            price: priceUsd,
            originalPrice: originalPriceUsd,
            currency: 'USD',
            productUrl: `https://www.eneba.com/${h.slug}`,
            gameType,
            imageUrl: h.images?.cover300?.src || '',
            backgroundUrl: '',
            releaseDate: '',
          };
        });
    } catch (error: unknown) {
      this.logger.error(
        `Eneba search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }
}
