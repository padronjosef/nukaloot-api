import type { Platform } from '../platform';

export type GameType = 'game' | 'dlc' | 'bundle' | 'other';

export interface ScrapedPrice {
  storeName: string;
  storeUrl: string;
  price: number;
  originalPrice?: number;
  currency: string;
  productUrl: string;
  gameName: string;
  gameType: GameType;
  /**
   * Which machine the key is for. Filled in by the pipeline once the listing
   * is classified, not by each scraper — see platform.ts.
   */
  platform?: Platform;
  imageUrl: string;
  backgroundUrl: string;
  releaseDate: string;
}

export interface GameScraper {
  readonly storeName: string;
  search(query: string, cc?: string): Promise<ScrapedPrice[]>;
}
