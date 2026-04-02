import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { ScrapersService, SteamIndex } from '../scrapers/scrapers.service';
import { GamesService } from '../games/games.service';
import { PricesService } from '../prices/prices.service';
import { Game } from '../entities';
import { Price } from '../entities';

describe('SearchService', () => {
  let service: SearchService;
  let scrapers: jest.Mocked<ScrapersService>;
  let games: jest.Mocked<GamesService>;
  let prices: jest.Mocked<PricesService>;

  const mockGame: Game = {
    id: 'game-1',
    name: 'Dark Souls',
    slug: 'dark-souls',
    coverUrl: '',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    prices: [],
  };

  const mockPrices: Price[] = [
    {
      id: 'p1',
      price: 9.99,
      originalPrice: 19.99,
      currency: 'USD',
      productUrl: 'https://store.steampowered.com/app/1',
      gameName: 'Dark Souls',
      gameType: 'game',
      imageUrl: 'https://img.com/1.jpg',
      backgroundUrl: 'https://img.com/bg1.jpg',
      releaseDate: '2011-09-22',
      scrapedAt: new Date(),
      game: mockGame,
      store: {
        id: 's1',
        name: 'Steam',
        url: 'https://store.steampowered.com',
        logoUrl: '',
        prices: [],
      },
    },
    {
      id: 'p2',
      price: 14.99,
      originalPrice: 29.99,
      currency: 'USD',
      productUrl: 'https://cheapshark.com/1',
      gameName: 'Dark Souls',
      gameType: 'game',
      imageUrl: 'https://img.com/2.jpg',
      backgroundUrl: 'https://img.com/bg2.jpg',
      releaseDate: '2011-09-22',
      scrapedAt: new Date(),
      game: mockGame,
      store: {
        id: 's2',
        name: 'CheapShark',
        url: 'https://cheapshark.com',
        logoUrl: '',
        prices: [],
      },
    },
    {
      id: 'p3',
      price: 19.99,
      originalPrice: 39.99,
      currency: 'USD',
      productUrl: 'https://example.com/3',
      gameName: 'Dark Souls',
      gameType: 'game',
      imageUrl: 'https://img.com/3.jpg',
      backgroundUrl: 'https://img.com/bg3.jpg',
      releaseDate: '2011-09-22',
      scrapedAt: new Date(),
      game: mockGame,
      store: {
        id: 's3',
        name: 'Store3',
        url: 'https://example.com',
        logoUrl: '',
        prices: [],
      },
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: ScrapersService,
          useValue: {
            searchAll: jest.fn(),
            searchFast: jest.fn(),
            searchSlow: jest.fn(),
          },
        },
        {
          provide: GamesService,
          useValue: {
            findOrCreate: jest.fn(),
          },
        },
        {
          provide: PricesService,
          useValue: {
            getCachedPrices: jest.fn(),
            savePrices: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    scrapers = module.get(ScrapersService);
    games = module.get(GamesService);
    prices = module.get(PricesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('search', () => {
    it('should return cached prices when cache hit', async () => {
      games.findOrCreate.mockResolvedValue(mockGame);
      prices.getCachedPrices.mockResolvedValue(mockPrices);

      const result = await service.search('Dark Souls', 1, 12);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(games.findOrCreate).toHaveBeenCalledWith('Dark Souls');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prices.getCachedPrices).toHaveBeenCalledWith('dark-souls');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(scrapers.searchAll).not.toHaveBeenCalled();
      expect(result.game).toEqual(mockGame);
      expect(result.prices).toEqual(mockPrices);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 12,
        total: 3,
        totalPages: 1,
      });
    });

    it('should scrape and save when cache miss', async () => {
      const scrapedPrices = [
        {
          storeName: 'Steam',
          storeUrl: 'https://store.steampowered.com',
          price: 9.99,
          originalPrice: 19.99,
          currency: 'USD',
          productUrl: 'https://store.steampowered.com/app/1',
          gameName: 'Dark Souls',
          gameType: 'game' as const,
          imageUrl: '',
          backgroundUrl: '',
          releaseDate: '',
        },
      ];

      games.findOrCreate.mockResolvedValue(mockGame);
      prices.getCachedPrices.mockResolvedValue(null);
      scrapers.searchAll.mockResolvedValue(scrapedPrices);
      prices.savePrices.mockResolvedValue(mockPrices);

      const result = await service.search('Dark Souls', 1, 12);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(scrapers.searchAll).toHaveBeenCalledWith('Dark Souls');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prices.savePrices).toHaveBeenCalledWith(mockGame, scrapedPrices);
      expect(result.prices).toEqual(mockPrices);
    });

    it('should paginate results correctly', async () => {
      games.findOrCreate.mockResolvedValue(mockGame);
      prices.getCachedPrices.mockResolvedValue(mockPrices);

      const result = await service.search('Dark Souls', 1, 2);

      expect(result.prices).toHaveLength(2);
      expect(result.prices[0]).toEqual(mockPrices[0]);
      expect(result.prices[1]).toEqual(mockPrices[1]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('should return second page of paginated results', async () => {
      games.findOrCreate.mockResolvedValue(mockGame);
      prices.getCachedPrices.mockResolvedValue(mockPrices);

      const result = await service.search('Dark Souls', 2, 2);

      expect(result.prices).toHaveLength(1);
      expect(result.prices[0]).toEqual(mockPrices[2]);
      expect(result.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('should return empty page when page exceeds total', async () => {
      games.findOrCreate.mockResolvedValue(mockGame);
      prices.getCachedPrices.mockResolvedValue(mockPrices);

      const result = await service.search('Dark Souls', 10, 12);

      expect(result.prices).toHaveLength(0);
      expect(result.pagination.total).toBe(3);
    });

    it('should handle empty scraped results on cache miss', async () => {
      games.findOrCreate.mockResolvedValue(mockGame);
      prices.getCachedPrices.mockResolvedValue(null);
      scrapers.searchAll.mockResolvedValue([]);
      prices.savePrices.mockResolvedValue([]);

      const result = await service.search('NonExistentGame', 1, 12);

      expect(result.prices).toHaveLength(0);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 12,
        total: 0,
        totalPages: 0,
      });
    });
  });

  describe('searchFast', () => {
    it('should return cached prices with null steamIndex on cache hit', async () => {
      games.findOrCreate.mockResolvedValue(mockGame);
      prices.getCachedPrices.mockResolvedValue(mockPrices);

      const result = await service.searchFast('Dark Souls', 'us');

      expect(result.game).toEqual(mockGame);
      expect(result.prices).toEqual(mockPrices);
      expect(result.steamIndex).toBeNull();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(scrapers.searchFast).not.toHaveBeenCalled();
    });

    it('should scrape and return steamIndex on cache miss', async () => {
      const steamIndex: SteamIndex = { map: new Map() };
      const scrapedPrices = [
        {
          storeName: 'Steam',
          storeUrl: 'https://store.steampowered.com',
          price: 9.99,
          currency: 'USD',
          productUrl: 'https://store.steampowered.com/app/1',
          gameName: 'Dark Souls',
          gameType: 'game' as const,
          imageUrl: '',
          backgroundUrl: '',
          releaseDate: '',
        },
      ];

      games.findOrCreate.mockResolvedValue(mockGame);
      prices.getCachedPrices.mockResolvedValue(null);
      scrapers.searchFast.mockResolvedValue({
        prices: scrapedPrices,
        steamIndex,
      });
      prices.savePrices.mockResolvedValue(mockPrices);

      const result = await service.searchFast('Dark Souls', 'co');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(scrapers.searchFast).toHaveBeenCalledWith('Dark Souls', 'co');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prices.savePrices).toHaveBeenCalledWith(mockGame, scrapedPrices);
      expect(result.game).toEqual(mockGame);
      expect(result.prices).toEqual(mockPrices);
      expect(result.steamIndex).toEqual(steamIndex);
    });

    it('should default cc to "us" when not provided', async () => {
      games.findOrCreate.mockResolvedValue(mockGame);
      prices.getCachedPrices.mockResolvedValue(mockPrices);

      await service.searchFast('Dark Souls');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(games.findOrCreate).toHaveBeenCalledWith('Dark Souls');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prices.getCachedPrices).toHaveBeenCalledWith('dark-souls');
    });
  });

  describe('searchSlow', () => {
    it('should delegate to scrapers.searchSlow', () => {
      const steamIndex: SteamIndex = { map: new Map() };
      const mockGenerator = (async function* () {
        yield await Promise.resolve([
          {
            storeName: 'Instant Gaming',
            storeUrl: 'https://instantgaming.com',
            price: 7.99,
            currency: 'USD',
            productUrl: 'https://instantgaming.com/1',
            gameName: 'Dark Souls',
            gameType: 'game' as const,
            imageUrl: '',
            backgroundUrl: '',
            releaseDate: '',
          },
        ]);
      })();

      scrapers.searchSlow.mockReturnValue(mockGenerator);

      const result = service.searchSlow('Dark Souls', steamIndex);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(scrapers.searchSlow).toHaveBeenCalledWith(
        'Dark Souls',
        steamIndex,
      );
      expect(result).toBe(mockGenerator);
    });

    it('should yield scraped results from the async generator', async () => {
      const steamIndex: SteamIndex = { map: new Map() };
      const scrapedBatch = [
        {
          storeName: 'Instant Gaming',
          storeUrl: 'https://instantgaming.com',
          price: 7.99,
          currency: 'USD',
          productUrl: 'https://instantgaming.com/1',
          gameName: 'Dark Souls',
          gameType: 'game' as const,
          imageUrl: '',
          backgroundUrl: '',
          releaseDate: '',
        },
      ];

      const mockGenerator = (async function* () {
        yield await Promise.resolve(scrapedBatch);
      })();

      scrapers.searchSlow.mockReturnValue(mockGenerator);

      const results: unknown[] = [];
      for await (const batch of service.searchSlow('Dark Souls', steamIndex)) {
        results.push(batch);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(scrapedBatch);
    });
  });
});
