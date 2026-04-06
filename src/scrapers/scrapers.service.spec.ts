import { ScrapersService, SteamIndex } from './scrapers.service';
import { SteamScraper } from './providers/steam.scraper';
import { CheapSharkScraper } from './providers/cheapshark.scraper';
import { InstantGamingScraper } from './providers/instantgaming.scraper';
import { EnebaScraper } from './providers/eneba.scraper';
import { G2AScraper } from './providers/g2a.scraper';
import { CDKeysScraper } from './providers/cdkeys.scraper';
import { KinguinScraper } from './providers/kinguin.scraper';
import { ScrapedPrice } from './interfaces/scraper.interface';

function makePrice(overrides: Partial<ScrapedPrice> = {}): ScrapedPrice {
  return {
    storeName: 'TestStore',
    storeUrl: 'https://test.com',
    gameName: 'Test Game',
    price: 9.99,
    originalPrice: undefined,
    currency: 'USD',
    productUrl: 'https://test.com/game',
    gameType: 'other',
    imageUrl: '',
    backgroundUrl: '',
    releaseDate: '',
    ...overrides,
  };
}

describe('ScrapersService', () => {
  let service: ScrapersService;
  let steamScraper: { search: jest.Mock; storeName: string };
  let cheapSharkScraper: { search: jest.Mock; storeName: string };
  let instantGamingScraper: { search: jest.Mock; storeName: string };
  let enebaScraper: { search: jest.Mock; storeName: string };
  let g2aScraper: { search: jest.Mock; storeName: string };
  let cdkeysScraper: { search: jest.Mock; storeName: string };
  let kinguinScraper: { search: jest.Mock; storeName: string };

  beforeEach(() => {
    steamScraper = {
      search: jest.fn().mockResolvedValue([]),
      storeName: 'Steam',
    };
    cheapSharkScraper = {
      search: jest.fn().mockResolvedValue([]),
      storeName: 'CheapShark',
    };
    instantGamingScraper = {
      search: jest.fn().mockResolvedValue([]),
      storeName: 'Instant Gaming',
    };
    enebaScraper = {
      search: jest.fn().mockResolvedValue([]),
      storeName: 'Eneba',
    };
    g2aScraper = {
      search: jest.fn().mockResolvedValue([]),
      storeName: 'G2A',
    };
    cdkeysScraper = {
      search: jest.fn().mockResolvedValue([]),
      storeName: 'CDKeys',
    };
    kinguinScraper = {
      search: jest.fn().mockResolvedValue([]),
      storeName: 'Kinguin',
    };

    service = new ScrapersService(
      steamScraper as unknown as SteamScraper,
      cheapSharkScraper as unknown as CheapSharkScraper,
      instantGamingScraper as unknown as InstantGamingScraper,
      enebaScraper as unknown as EnebaScraper,
      g2aScraper as unknown as G2AScraper,
      cdkeysScraper as unknown as CDKeysScraper,
      kinguinScraper as unknown as KinguinScraper,
    );
  });

  describe('searchFast', () => {
    it('should call both Steam and CheapShark scrapers', async () => {
      await service.searchFast('dark souls');
      expect(steamScraper.search).toHaveBeenCalledWith('dark souls', 'us');
      expect(cheapSharkScraper.search).toHaveBeenCalledWith('dark souls');
    });

    it('should always pass us to Steam scraper regardless of cc', async () => {
      await service.searchFast('dark souls', 'gb');
      expect(steamScraper.search).toHaveBeenCalledWith('dark souls', 'us');
    });

    it('should default cc to "us"', async () => {
      await service.searchFast('test');
      expect(steamScraper.search).toHaveBeenCalledWith('test', 'us');
    });

    it('should return combined results from both scrapers', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Dark Souls',
          price: 39.99,
          gameType: 'game',
        }),
      ]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({ storeName: 'GOG', gameName: 'Dark Souls', price: 29.99 }),
      ]);

      const { prices } = await service.searchFast('dark souls');
      expect(prices.length).toBeGreaterThanOrEqual(2);
    });

    it('should return results sorted by price ascending', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Game',
          price: 30,
          gameType: 'game',
        }),
      ]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({ storeName: 'GOG', gameName: 'Game', price: 10 }),
      ]);

      const { prices } = await service.searchFast('game');
      expect(prices[0].price).toBeLessThanOrEqual(
        prices[prices.length - 1].price,
      );
    });

    it('should handle Steam scraper failure gracefully', async () => {
      steamScraper.search.mockRejectedValue(new Error('Steam down'));
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({ storeName: 'GOG', gameName: 'Game', price: 10 }),
      ]);

      const { prices } = await service.searchFast('game');
      expect(prices.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle CheapShark scraper failure gracefully', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Game',
          price: 10,
          gameType: 'game',
        }),
      ]);
      cheapSharkScraper.search.mockRejectedValue(new Error('CheapShark down'));

      const { prices } = await service.searchFast('game');
      expect(prices.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle both scrapers failing', async () => {
      steamScraper.search.mockRejectedValue(new Error('Steam down'));
      cheapSharkScraper.search.mockRejectedValue(new Error('CS down'));

      const { prices } = await service.searchFast('game');
      expect(prices).toEqual([]);
    });

    it('should return a steamIndex built from Steam results', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Dark Souls III',
          price: 39.99,
          gameType: 'game',
          imageUrl: 'https://img.steam/ds3.jpg',
          backgroundUrl: 'https://bg.steam/ds3.jpg',
          releaseDate: 'Apr 12, 2016',
        }),
      ]);

      const { steamIndex } = await service.searchFast('dark souls');
      expect(steamIndex.map.size).toBe(1);
      // standardizeName title-cases, so lookup normalized (lowercase, alphanum only)
      const entry = steamIndex.map.get('darksoulsiii');
      expect(entry).toBeDefined();
      expect(entry!.gameType).toBe('game');
    });

    it('should deduplicate same store + same game keeping cheapest', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Game',
          price: 20,
          gameType: 'game',
        }),
      ]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({ storeName: 'Steam', gameName: 'Game', price: 15 }),
      ]);

      const { prices } = await service.searchFast('game');
      const steamPrices = prices.filter((p) => p.storeName === 'Steam');
      expect(steamPrices).toHaveLength(1);
      expect(steamPrices[0].price).toBe(15);
    });

    it('should standardize game names', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'DARK SOULS™ III',
          price: 39.99,
          gameType: 'game',
        }),
      ]);

      const { prices } = await service.searchFast('dark souls');
      // standardizeName removes ™ and title-cases
      expect(prices[0].gameName).toBe('Dark Souls Iii');
    });
  });

  describe('searchSlow', () => {
    it('should yield instant gaming results', async () => {
      instantGamingScraper.search.mockResolvedValue([
        makePrice({ storeName: 'Instant Gaming', gameName: 'Game', price: 5 }),
      ]);

      const steamIndex: SteamIndex = { map: new Map() };
      const resultEvents: ScrapedPrice[][] = [];
      for await (const event of service.searchSlow('game', steamIndex)) {
        if (event.type === 'results') {
          resultEvents.push(event.prices);
        }
      }

      expect(resultEvents).toHaveLength(1);
      expect(resultEvents[0].length).toBeGreaterThanOrEqual(1);
    });

    it('should not yield results when scraper returns empty array', async () => {
      instantGamingScraper.search.mockResolvedValue([]);

      const steamIndex: SteamIndex = { map: new Map() };
      const resultEvents: ScrapedPrice[][] = [];
      for await (const event of service.searchSlow('game', steamIndex)) {
        if (event.type === 'results') {
          resultEvents.push(event.prices);
        }
      }

      expect(resultEvents).toHaveLength(0);
    });

    it('should handle scraper failure gracefully', async () => {
      instantGamingScraper.search.mockRejectedValue(
        new Error('Browser crashed'),
      );

      const steamIndex: SteamIndex = { map: new Map() };
      const resultEvents: ScrapedPrice[][] = [];
      for await (const event of service.searchSlow('game', steamIndex)) {
        if (event.type === 'results') {
          resultEvents.push(event.prices);
        }
      }

      expect(resultEvents).toHaveLength(0);
    });

    it('should enrich results with steam data', async () => {
      instantGamingScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Instant Gaming',
          gameName: 'Dark Souls Iii',
          price: 5,
          gameType: 'other',
        }),
      ]);

      const steamIndex: SteamIndex = {
        map: new Map([
          [
            'darksoulsiii',
            {
              gameType: 'game',
              gameName: 'Dark Souls Iii',
              imageUrl: 'https://img/ds3.jpg',
              backgroundUrl: 'https://bg/ds3.jpg',
              releaseDate: 'Apr 12, 2016',
            },
          ],
        ]),
      };

      const resultEvents: ScrapedPrice[][] = [];
      for await (const event of service.searchSlow('dark souls', steamIndex)) {
        if (event.type === 'results') {
          resultEvents.push(event.prices);
        }
      }

      expect(resultEvents).toHaveLength(1);
      expect(resultEvents[0][0].gameType).toBe('game');
      expect(resultEvents[0][0].imageUrl).toBe('https://img/ds3.jpg');
    });
  });

  describe('enrichWithSteamData (tested via searchFast)', () => {
    it('should exact match and enrich CheapShark results with Steam data', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Hades',
          price: 24.99,
          gameType: 'game',
          imageUrl: 'https://img/hades.jpg',
          backgroundUrl: 'https://bg/hades.jpg',
          releaseDate: 'Sep 17, 2020',
        }),
      ]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'GOG',
          gameName: 'Hades',
          price: 19.99,
          gameType: 'other',
          imageUrl: '',
          backgroundUrl: '',
          releaseDate: '',
        }),
      ]);

      const { prices } = await service.searchFast('hades');
      const gog = prices.find((p) => p.storeName === 'GOG');
      expect(gog).toBeDefined();
      expect(gog!.gameType).toBe('game');
      expect(gog!.imageUrl).toBe('https://img/hades.jpg');
      expect(gog!.backgroundUrl).toBe('https://bg/hades.jpg');
      expect(gog!.releaseDate).toBe('Sep 17, 2020');
    });

    it('should partial match when CheapShark name contains Steam name', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Dark Souls Ii',
          price: 39.99,
          gameType: 'game',
          imageUrl: 'https://img/ds2.jpg',
          backgroundUrl: '',
          releaseDate: '',
        }),
      ]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Fanatical',
          gameName: 'Dark Souls II Crown Of The Sunken King',
          price: 9.99,
          gameType: 'other',
          imageUrl: '',
        }),
      ]);

      const { prices } = await service.searchFast('dark souls');
      const fanatical = prices.find((p) => p.storeName === 'Fanatical');
      expect(fanatical).toBeDefined();
      // Partial match should enrich with Steam data
      expect(fanatical!.gameType).toBe('game');
    });

    it('should prefer longest partial match', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Dark Souls',
          price: 39.99,
          gameType: 'game',
          imageUrl: 'https://img/ds.jpg',
          backgroundUrl: '',
          releaseDate: '',
        }),
        makePrice({
          storeName: 'Steam',
          gameName: 'Dark Souls Ii Scholar Of The First Sin',
          price: 39.99,
          gameType: 'game',
          imageUrl: 'https://img/ds2sotfs.jpg',
          backgroundUrl: '',
          releaseDate: '',
        }),
      ]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'GOG',
          gameName: 'Dark Souls II Scholar Of The First Sin',
          price: 29.99,
          gameType: 'other',
          imageUrl: '',
        }),
      ]);

      const { prices } = await service.searchFast('dark souls');
      const gog = prices.find((p) => p.storeName === 'GOG');
      expect(gog).toBeDefined();
      // Should match the longer "Dark Souls Ii Scholar Of The First Sin" entry
      expect(gog!.imageUrl).toBe('https://img/ds2sotfs.jpg');
    });

    it('should not overwrite gameType when already known (not "unknown")', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Hades',
          price: 24.99,
          gameType: 'game',
          imageUrl: 'https://img/hades.jpg',
          backgroundUrl: '',
          releaseDate: '',
        }),
      ]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'GOG',
          gameName: 'Hades',
          price: 19.99,
          gameType: 'dlc', // already set, should not be overwritten
        }),
      ]);

      const { prices } = await service.searchFast('hades');
      const gog = prices.find((p) => p.storeName === 'GOG');
      expect(gog).toBeDefined();
      expect(gog!.gameType).toBe('dlc');
    });

    it('should infer "bundle" gameType from name keywords', async () => {
      steamScraper.search.mockResolvedValue([]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'GOG',
          gameName: 'Hades Complete Edition',
          price: 29.99,
          gameType: 'other',
        }),
      ]);

      const { prices } = await service.searchFast('hades');
      const gog = prices.find((p) => p.storeName === 'GOG');
      expect(gog).toBeDefined();
      expect(gog!.gameType).toBe('bundle');
    });

    it('should infer "bundle" for various bundle keywords', async () => {
      const keywords = [
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

      for (const kw of keywords) {
        steamScraper.search.mockResolvedValue([]);
        cheapSharkScraper.search.mockResolvedValue([
          makePrice({
            storeName: 'GOG',
            gameName: `Test ${kw}`,
            price: 10,
            gameType: 'other',
          }),
        ]);

        const { prices } = await service.searchFast('test');
        const gog = prices.find((p) => p.storeName === 'GOG');
        expect(gog).toBeDefined();
        expect(gog!.gameType).toBe('bundle');
      }
    });

    it('should also override "game" with inferred "bundle" from name keywords', async () => {
      // Steam prices are not passed through enrichWithSteamData in searchFast,
      // so inferGameType does not run on them. Only CheapShark/slow scraper
      // results go through enrichWithSteamData. Test with a CheapShark result instead.
      steamScraper.search.mockResolvedValue([]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'GOG',
          gameName: 'Hades Deluxe Edition',
          price: 39.99,
          gameType: 'game',
          imageUrl: 'https://img/hades.jpg',
          backgroundUrl: '',
          releaseDate: '',
        }),
      ]);

      const { prices } = await service.searchFast('hades');
      // enrichWithSteamData runs inferGameType on items with 'game' or 'other'
      const gog = prices.find((p) => p.storeName === 'GOG');
      expect(gog).toBeDefined();
      expect(gog!.gameType).toBe('bundle');
    });
  });

  describe('deduplicateAndSort (tested via searchFast)', () => {
    it('should keep only the cheapest price per store+game combo', async () => {
      steamScraper.search.mockResolvedValue([]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({ storeName: 'GOG', gameName: 'Hades', price: 19.99 }),
        makePrice({ storeName: 'GOG', gameName: 'Hades', price: 14.99 }),
        makePrice({ storeName: 'GOG', gameName: 'Hades', price: 24.99 }),
      ]);

      const { prices } = await service.searchFast('hades');
      const gog = prices.filter((p) => p.storeName === 'GOG');
      expect(gog).toHaveLength(1);
      expect(gog[0].price).toBe(14.99);
    });

    it('should sort results by price ascending', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Game',
          price: 30,
          gameType: 'game',
        }),
      ]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({ storeName: 'GOG', gameName: 'Game', price: 10 }),
        makePrice({ storeName: 'Fanatical', gameName: 'Game', price: 20 }),
      ]);

      const { prices } = await service.searchFast('game');
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i].price).toBeGreaterThanOrEqual(prices[i - 1].price);
      }
    });

    it('should allow same game from different stores', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Game',
          price: 30,
          gameType: 'game',
        }),
      ]);
      cheapSharkScraper.search.mockResolvedValue([
        makePrice({ storeName: 'GOG', gameName: 'Game', price: 25 }),
        makePrice({ storeName: 'Fanatical', gameName: 'Game', price: 20 }),
      ]);

      const { prices } = await service.searchFast('game');
      const storeNames = prices.map((p) => p.storeName);
      expect(storeNames).toContain('Steam');
      expect(storeNames).toContain('GOG');
      expect(storeNames).toContain('Fanatical');
    });
  });

  describe('searchAll', () => {
    it('should delegate to searchFast and return prices', async () => {
      steamScraper.search.mockResolvedValue([
        makePrice({
          storeName: 'Steam',
          gameName: 'Game',
          price: 10,
          gameType: 'game',
        }),
      ]);
      cheapSharkScraper.search.mockResolvedValue([]);

      const result = await service.searchAll('game');
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(steamScraper.search).toHaveBeenCalled();
    });
  });
});
