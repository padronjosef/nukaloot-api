import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  GameScraper,
  GameType,
  ScrapedPrice,
} from '../interfaces/scraper.interface';

interface SteamStoreSearchItem {
  id: number;
  name: string;
}

interface SteamStoreSearchResponse {
  items?: SteamStoreSearchItem[];
}

interface SteamPriceOverview {
  final: number;
  initial: number;
  currency: string;
}

interface SteamAppData {
  name: string;
  type?: string;
  price_overview?: SteamPriceOverview;
  header_image?: string;
  background_raw?: string;
  release_date?: { date?: string };
}

interface SteamAppDetailsResponse {
  [appId: string]: { data?: SteamAppData };
}

@Injectable()
export class SteamScraper implements GameScraper {
  readonly storeName = 'Steam';
  private readonly logger = new Logger(SteamScraper.name);

  constructor(private readonly http: HttpService) {}

  async search(query: string, cc = 'us'): Promise<ScrapedPrice[]> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<SteamStoreSearchResponse>(
          'https://store.steampowered.com/api/storesearch/',
          {
            params: { term: query, l: 'english', cc },
          },
        ),
      );

      if (!data?.items?.length) return [];

      const results: ScrapedPrice[] = [];

      for (const item of data.items.slice(0, 60)) {
        try {
          const { data: details } = await firstValueFrom(
            this.http.get<SteamAppDetailsResponse>(
              `https://store.steampowered.com/api/appdetails?appids=${item.id}&cc=${cc}`,
            ),
          );

          const appData = details?.[String(item.id)]?.data;
          if (!appData?.price_overview) continue;

          const priceData = appData.price_overview;
          const steamType = appData.type?.toLowerCase() || '';

          let gameType: GameType = 'other';
          if (steamType === 'game') gameType = 'game';
          else if (steamType === 'dlc') gameType = 'dlc';
          else if (steamType === 'bundle' || steamType === 'sub')
            gameType = 'bundle';

          results.push({
            storeName: this.storeName,
            storeUrl: 'https://store.steampowered.com',
            gameName: appData.name,
            price: priceData.final / 100,
            originalPrice:
              priceData.initial !== priceData.final
                ? priceData.initial / 100
                : undefined,
            currency: priceData.currency || 'USD',
            productUrl: `https://store.steampowered.com/app/${item.id}`,
            gameType,
            imageUrl: appData.header_image || '',
            backgroundUrl: appData.background_raw || '',
            releaseDate: appData.release_date?.date || '',
          });
        } catch {
          this.logger.warn(`Failed to get details for Steam app ${item.id}`);
        }
      }

      return results;
    } catch (error: unknown) {
      this.logger.error(
        `Steam search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }
}
