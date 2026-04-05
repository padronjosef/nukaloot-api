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
  imageUrl: string;
  backgroundUrl: string;
  releaseDate: string;
}

export interface GameScraper {
  readonly storeName: string;
  search(query: string, cc?: string): Promise<ScrapedPrice[]>;
}
