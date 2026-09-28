import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { GameScraper, ScrapedPrice } from '../interfaces/scraper.interface';

// CheapShark is a free API that aggregates prices from multiple stores:
// GamersGate, GreenManGaming, Humble, GOG, Fanatical, etc.
// https://apidocs.cheapshark.com/

/** Who we are, as CheapShark asks callers to say. */
const CLIENT_USER_AGENT = 'Nukaloot/1.0 (+https://nukaloot.com)';

interface CheapSharkDeal {
  title: string;
  salePrice: string;
  normalPrice: string;
  dealID: string;
  storeID: string;
  metacriticScore: string;
  thumb: string;
  steamAppID: string | null;
}

const STORE_MAP: Record<string, string> = {
  '1': 'Steam',
  '2': 'GamersGate',
  '3': 'GreenManGaming',
  '7': 'GOG',
  '8': 'Origin',
  '11': 'Humble Bundle',
  '13': 'Uplay',
  '15': 'Fanatical',
  '21': 'WinGameStore',
  '23': 'GameBillet',
  '24': 'Voidu',
  '25': 'Epic Games',
  '27': 'Games Planet',
  '28': 'Gamesload',
  '29': '2Game',
  '30': 'IndieGala',
  '31': 'Blizzard',
  '33': 'DLGamer',
  '34': 'Noctre',
  '35': 'DreamGame',
};

@Injectable()
export class CheapSharkScraper implements GameScraper {
  readonly storeName = 'CheapShark';
  private readonly logger = new Logger(CheapSharkScraper.name);

  constructor(private readonly http: HttpService) {}

  async search(query: string): Promise<ScrapedPrice[]> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<CheapSharkDeal[]>(
          'https://www.cheapshark.com/api/1.0/deals',
          {
            params: {
              title: query,
              sortBy: 'Price',
              pageSize: 60,
            },
            // CheapShark answers 400 to a generic or missing User-Agent and
            // asks to be told who is calling. Without this the whole store
            // list it covers — GOG, Fanatical, GreenManGaming and the rest —
            // silently disappears from every search.
            headers: { 'User-Agent': CLIENT_USER_AGENT },
          },
        ),
      );

      if (!data?.length) return [];

      return data.map((deal) => ({
        storeName: STORE_MAP[deal.storeID] || `Store #${deal.storeID}`,
        storeUrl: 'https://www.cheapshark.com',
        gameName: deal.title,
        price: parseFloat(deal.salePrice),
        originalPrice:
          deal.normalPrice !== deal.salePrice
            ? parseFloat(deal.normalPrice)
            : undefined,
        currency: 'USD',
        productUrl: `https://www.cheapshark.com/redirect?dealID=${deal.dealID}`,
        gameType: 'other',
        imageUrl: deal.steamAppID
          ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${deal.steamAppID}/header.jpg`
          : deal.thumb || '',
        backgroundUrl: '',
        releaseDate: '',
      }));
    } catch (error: unknown) {
      this.logger.error(
        `CheapShark search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }
}
