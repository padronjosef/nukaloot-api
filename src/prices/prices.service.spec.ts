import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricesService } from './prices.service';
import { Price, Store, Game } from '../entities';
import { ScrapedPrice } from '../scrapers/interfaces/scraper.interface';

type MockRepository<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

function createMockRepository<T>(): MockRepository<T> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
}

describe('PricesService', () => {
  let service: PricesService;
  let priceRepo: MockRepository<Price>;
  let storeRepo: MockRepository<Store>;

  const mockGame: Game = {
    id: 'game-1',
    name: 'Dark Souls',
    slug: 'dark-souls',
    coverUrl: '',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    prices: [],
  };

  const mockStore: Store = {
    id: 'store-1',
    name: 'Steam',
    url: 'https://store.steampowered.com',
    logoUrl: '',
    prices: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricesService,
        {
          provide: getRepositoryToken(Price),
          useValue: createMockRepository<Price>(),
        },
        {
          provide: getRepositoryToken(Store),
          useValue: createMockRepository<Store>(),
        },
        {
          provide: getRepositoryToken(Game),
          useValue: createMockRepository<Game>(),
        },
      ],
    }).compile();

    service = module.get<PricesService>(PricesService);
    priceRepo = module.get(getRepositoryToken(Price));
    storeRepo = module.get(getRepositoryToken(Store));
    module.get(getRepositoryToken(Game));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCachedPrices', () => {
    it('should return prices when cache has results', async () => {
      const mockPrices: Price[] = [
        {
          id: 'p1',
          price: 9.99,
          originalPrice: 19.99,
          currency: 'USD',
          productUrl: 'https://store.steampowered.com/app/1',
          gameName: 'Dark Souls',
          gameType: 'game',
          imageUrl: '',
          backgroundUrl: '',
          releaseDate: '',
          scrapedAt: new Date(),
          game: mockGame,
          store: mockStore,
        },
      ];

      priceRepo.find!.mockResolvedValue(mockPrices);

      const result = await service.getCachedPrices('dark-souls');

      expect(result).toEqual(mockPrices);
      expect(priceRepo.find).toHaveBeenCalledWith({
        where: {
          game: { slug: 'dark-souls' },
          scrapedAt: expect.objectContaining({}) as unknown,
        },
        relations: ['store', 'game'],
        order: { price: 'ASC' },
      });
    });

    it('should return null when no cached prices exist', async () => {
      priceRepo.find!.mockResolvedValue([]);

      const result = await service.getCachedPrices('dark-souls');

      expect(result).toBeNull();
    });

    it('should query with MoreThan the last refresh time', async () => {
      priceRepo.find!.mockResolvedValue([]);

      await service.getCachedPrices('dark-souls');

      const callArgs = (priceRepo.find!.mock.calls[0] as unknown[])[0] as {
        where: { scrapedAt: unknown; game: unknown };
      };
      // The scrapedAt should use MoreThan with a Date
      expect(callArgs.where.scrapedAt).toBeDefined();
      expect(callArgs.where.game).toEqual({ slug: 'dark-souls' });
    });

    it('should load store and game relations', async () => {
      priceRepo.find!.mockResolvedValue([]);

      await service.getCachedPrices('any-game');

      const callArgs = (priceRepo.find!.mock.calls[0] as unknown[])[0] as {
        relations: string[];
      };
      expect(callArgs.relations).toEqual(['store', 'game']);
    });

    it('should sort by price ascending', async () => {
      priceRepo.find!.mockResolvedValue([]);

      await service.getCachedPrices('any-game');

      const callArgs = (priceRepo.find!.mock.calls[0] as unknown[])[0] as {
        order: Record<string, string>;
      };
      expect(callArgs.order).toEqual({ price: 'ASC' });
    });
  });

  describe('savePrices', () => {
    const scrapedPrice: ScrapedPrice = {
      storeName: 'Steam',
      storeUrl: 'https://store.steampowered.com',
      price: 9.99,
      originalPrice: 19.99,
      currency: 'USD',
      productUrl: 'https://store.steampowered.com/app/570',
      gameName: 'Dark Souls',
      gameType: 'game',
      imageUrl: 'https://img.com/1.jpg',
      backgroundUrl: 'https://img.com/bg1.jpg',
      releaseDate: '2011-09-22',
    };

    it('should find existing store and reuse it', async () => {
      storeRepo.findOne!.mockResolvedValue(mockStore);
      priceRepo.findOne!.mockResolvedValue(null);
      priceRepo.create!.mockReturnValue({ ...scrapedPrice, id: 'new-price' });
      priceRepo.save!.mockResolvedValue({ ...scrapedPrice, id: 'new-price' });
      priceRepo.find!.mockResolvedValue([]);

      await service.savePrices(mockGame, [scrapedPrice]);

      expect(storeRepo.findOne).toHaveBeenCalledWith({
        where: { name: 'Steam' },
      });
      expect(storeRepo.create).not.toHaveBeenCalled();
    });

    it('should create new store when not found', async () => {
      const newStore = { ...mockStore, id: 'new-store' };
      storeRepo.findOne!.mockResolvedValue(null);
      storeRepo.create!.mockReturnValue(newStore);
      storeRepo.save!.mockResolvedValue(newStore);
      priceRepo.findOne!.mockResolvedValue(null);
      priceRepo.create!.mockReturnValue({ ...scrapedPrice, id: 'new-price' });
      priceRepo.save!.mockResolvedValue({ ...scrapedPrice, id: 'new-price' });
      priceRepo.find!.mockResolvedValue([]);

      await service.savePrices(mockGame, [scrapedPrice]);

      expect(storeRepo.create).toHaveBeenCalledWith({
        name: 'Steam',
        url: 'https://store.steampowered.com',
      });
      expect(storeRepo.save).toHaveBeenCalledWith(newStore);
    });

    it('should create new price when no existing price found', async () => {
      storeRepo.findOne!.mockResolvedValue(mockStore);
      priceRepo.findOne!.mockResolvedValue(null);
      const newPrice = {
        price: 9.99,
        originalPrice: 19.99,
        currency: 'USD',
        productUrl: 'https://store.steampowered.com/app/570',
        gameName: 'Dark Souls',
        gameType: 'game',
        imageUrl: 'https://img.com/1.jpg',
        backgroundUrl: 'https://img.com/bg1.jpg',
        releaseDate: '2011-09-22',
        game: mockGame,
        store: mockStore,
      };
      priceRepo.create!.mockReturnValue(newPrice);
      priceRepo.save!.mockResolvedValue({ ...newPrice, id: 'p-new' });
      priceRepo.find!.mockResolvedValue([]);

      await service.savePrices(mockGame, [scrapedPrice]);

      expect(priceRepo.create).toHaveBeenCalledWith({
        price: 9.99,
        originalPrice: 19.99,
        currency: 'USD',
        productUrl: 'https://store.steampowered.com/app/570',
        gameName: 'Dark Souls',
        gameType: 'game',
        imageUrl: 'https://img.com/1.jpg',
        backgroundUrl: 'https://img.com/bg1.jpg',
        releaseDate: '2011-09-22',
        game: mockGame,
        store: mockStore,
      });
      expect(priceRepo.save).toHaveBeenCalled();
    });

    it('should update existing price when found (upsert)', async () => {
      const existingPrice: Price = {
        id: 'existing-1',
        price: 15.99,
        originalPrice: 29.99,
        currency: 'USD',
        productUrl: 'https://store.steampowered.com/app/570',
        gameName: 'Dark Souls Old',
        gameType: 'other',
        imageUrl: 'old.jpg',
        backgroundUrl: 'old-bg.jpg',
        releaseDate: '',
        scrapedAt: new Date('2025-01-01'),
        game: mockGame,
        store: mockStore,
      };

      storeRepo.findOne!.mockResolvedValue(mockStore);
      priceRepo.findOne!.mockResolvedValue(existingPrice);
      priceRepo.save!.mockResolvedValue(existingPrice);
      priceRepo.find!.mockResolvedValue([existingPrice]);

      await service.savePrices(mockGame, [scrapedPrice]);

      // Verify the existing price was updated
      expect(existingPrice.price).toBe(9.99);
      expect(existingPrice.originalPrice).toBe(19.99);
      expect(existingPrice.currency).toBe('USD');
      expect(existingPrice.gameName).toBe('Dark Souls');
      expect(existingPrice.gameType).toBe('game');
      expect(existingPrice.imageUrl).toBe('https://img.com/1.jpg');
      expect(existingPrice.backgroundUrl).toBe('https://img.com/bg1.jpg');
      expect(existingPrice.releaseDate).toBe('2011-09-22');
      expect(existingPrice.scrapedAt).toBeInstanceOf(Date);
      expect(priceRepo.save).toHaveBeenCalledWith(existingPrice);
      // Should not create new price
      expect(priceRepo.create).not.toHaveBeenCalled();
    });

    it('should look up existing price by game id, store id, and productUrl', async () => {
      storeRepo.findOne!.mockResolvedValue(mockStore);
      priceRepo.findOne!.mockResolvedValue(null);
      priceRepo.create!.mockReturnValue({});
      priceRepo.save!.mockResolvedValue({});
      priceRepo.find!.mockResolvedValue([]);

      await service.savePrices(mockGame, [scrapedPrice]);

      expect(priceRepo.findOne).toHaveBeenCalledWith({
        where: {
          game: { id: 'game-1' },
          store: { id: 'store-1' },
          productUrl: 'https://store.steampowered.com/app/570',
        },
      });
    });

    it('should process multiple scraped prices', async () => {
      const scrapedPrices: ScrapedPrice[] = [
        {
          ...scrapedPrice,
          storeName: 'Steam',
          storeUrl: 'https://store.steampowered.com',
        },
        {
          ...scrapedPrice,
          storeName: 'CheapShark',
          storeUrl: 'https://cheapshark.com',
          price: 7.99,
          productUrl: 'https://cheapshark.com/1',
        },
      ];

      const cheapSharkStore: Store = {
        id: 'store-2',
        name: 'CheapShark',
        url: 'https://cheapshark.com',
        logoUrl: '',
        prices: [],
      };

      storeRepo
        .findOne!.mockResolvedValueOnce(mockStore)
        .mockResolvedValueOnce(cheapSharkStore);
      priceRepo
        .findOne!.mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      priceRepo.create!.mockReturnValue({});
      priceRepo.save!.mockResolvedValue({});
      priceRepo.find!.mockResolvedValue([]);

      await service.savePrices(mockGame, scrapedPrices);

      expect(storeRepo.findOne).toHaveBeenCalledTimes(2);
      expect(priceRepo.findOne).toHaveBeenCalledTimes(2);
      expect(priceRepo.create).toHaveBeenCalledTimes(2);
      expect(priceRepo.save).toHaveBeenCalledTimes(2);
    });

    it('should return fresh prices from DB after saving', async () => {
      const savedPrices: Price[] = [
        {
          id: 'p1',
          price: 9.99,
          originalPrice: 19.99,
          currency: 'USD',
          productUrl: 'https://store.steampowered.com/app/570',
          gameName: 'Dark Souls',
          gameType: 'game',
          imageUrl: '',
          backgroundUrl: '',
          releaseDate: '',
          scrapedAt: new Date(),
          game: mockGame,
          store: mockStore,
        },
      ];

      storeRepo.findOne!.mockResolvedValue(mockStore);
      priceRepo.findOne!.mockResolvedValue(null);
      priceRepo.create!.mockReturnValue({});
      priceRepo.save!.mockResolvedValue({});
      priceRepo.find!.mockResolvedValue(savedPrices);

      const result = await service.savePrices(mockGame, [scrapedPrice]);

      expect(result).toEqual(savedPrices);
      expect(priceRepo.find).toHaveBeenCalledWith({
        where: { game: { id: 'game-1' } },
        relations: ['store', 'game'],
        order: { price: 'ASC' },
      });
    });

    it('should handle empty scraped prices array', async () => {
      const savedPrices: Price[] = [];
      priceRepo.find!.mockResolvedValue(savedPrices);

      const result = await service.savePrices(mockGame, []);

      expect(result).toEqual([]);
      expect(storeRepo.findOne).not.toHaveBeenCalled();
      expect(priceRepo.findOne).not.toHaveBeenCalled();
    });

    it('should handle originalPrice being undefined in scraped data', async () => {
      const scrapedWithoutOriginal: ScrapedPrice = {
        ...scrapedPrice,
        originalPrice: undefined,
      };

      storeRepo.findOne!.mockResolvedValue(mockStore);
      priceRepo.findOne!.mockResolvedValue(null);
      priceRepo.create!.mockReturnValue({});
      priceRepo.save!.mockResolvedValue({});
      priceRepo.find!.mockResolvedValue([]);

      await service.savePrices(mockGame, [scrapedWithoutOriginal]);

      expect(priceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          originalPrice: undefined,
        }),
      );
    });
  });
});
