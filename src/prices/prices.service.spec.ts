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
    update: jest.fn().mockResolvedValue({ affected: 1 }),
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
          platform: 'pc',
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

    /**
     * Rows saved by an older pipeline are incomplete — console listings were
     * thrown away at scrape time — so a cached set from before it reports a
     * game as PC-only when it is not. The epoch forces one re-scrape instead
     * of serving that until the daily boundary passes.
     */
    describe('the pipeline epoch', () => {
      const cutoffOf = () => {
        const args = (priceRepo.find!.mock.calls[0] as unknown[])[0] as {
          where: { scrapedAt: { value: Date } };
        };
        return args.where.scrapedAt.value;
      };

      afterEach(() => {
        delete process.env.PRICE_CACHE_EPOCH;
      });

      it('ignores prices older than the epoch', async () => {
        process.env.PRICE_CACHE_EPOCH = '2099-01-01T00:00:00Z';
        priceRepo.find!.mockResolvedValue([]);

        await service.getCachedPrices('dark-souls');

        expect(cutoffOf()).toEqual(new Date('2099-01-01T00:00:00Z'));
      });

      it('never lengthens the cache past the daily boundary', async () => {
        // An epoch in the distant past must not resurrect prices the daily
        // refresh has already retired.
        process.env.PRICE_CACHE_EPOCH = '1990-01-01T00:00:00Z';
        priceRepo.find!.mockResolvedValue([]);

        await service.getCachedPrices('dark-souls');

        expect(cutoffOf().getTime()).toBeGreaterThan(
          new Date('1990-01-01T00:00:00Z').getTime(),
        );
      });

      it.each([
        ['not a date', 'whenever'],
        ['empty', ''],
        ['a number', '0'],
      ])(
        'falls back to the daily boundary when the epoch is %s',
        async (_label, value) => {
          // A typo here would otherwise invalidate every cached price and
          // re-scrape every game on every search.
          process.env.PRICE_CACHE_EPOCH = value;
          priceRepo.find!.mockResolvedValue([]);

          await service.getCachedPrices('dark-souls');

          const cutoff = cutoffOf();
          expect(Number.isNaN(cutoff.getTime())).toBe(false);
          expect(cutoff.getUTCHours()).toBe(18);
        },
      );
    });
  });

  describe('the game cover', () => {
    /**
     * A game is created from a search term and has no artwork, so every list
     * that shows one draws a placeholder forever. The listings carry the
     * image; the first one that has it lends it to the game.
     */
    const scraped = (over: Partial<ScrapedPrice> = {}): ScrapedPrice => ({
      storeName: 'Steam',
      storeUrl: 'https://store.steampowered.com',
      price: 9.99,
      currency: 'USD',
      productUrl: 'https://store.steampowered.com/app/570',
      gameName: 'Dark Souls',
      gameType: 'game',
      imageUrl: 'https://img.test/cover.jpg',
      backgroundUrl: '',
      releaseDate: '',
      ...over,
    });

    beforeEach(() => {
      storeRepo.findOne!.mockResolvedValue(mockStore);
      priceRepo.findOne!.mockResolvedValue(null);
      priceRepo.create!.mockImplementation((v: unknown) => v);
      priceRepo.save!.mockImplementation((v: unknown) => Promise.resolve(v));
    });

    it('borrows the first image it is given', async () => {
      const game = { ...mockGame, coverUrl: '' };
      await service.savePrices(game, [scraped()]);

      expect(game.coverUrl).toBe('https://img.test/cover.jpg');
    });

    it('does not overwrite a cover the game already has', async () => {
      // Whatever is there was chosen once; a later scrape must not churn it.
      const game = { ...mockGame, coverUrl: 'https://img.test/kept.jpg' };
      await service.savePrices(game, [scraped()]);

      expect(game.coverUrl).toBe('https://img.test/kept.jpg');
    });

    it('skips listings with no image rather than storing an empty one', async () => {
      // An empty string would count as "has a cover" and lock the placeholder
      // in forever.
      const game = { ...mockGame, coverUrl: '' };
      await service.savePrices(game, [
        scraped({ imageUrl: '', productUrl: 'https://a.test/1' }),
        scraped({
          imageUrl: 'https://img.test/second.jpg',
          productUrl: 'https://a.test/2',
        }),
      ]);

      expect(game.coverUrl).toBe('https://img.test/second.jpg');
    });

    it('leaves the game alone when no listing has an image', async () => {
      const game = { ...mockGame, coverUrl: '' };
      await service.savePrices(game, [scraped({ imageUrl: '' })]);

      expect(game.coverUrl).toBe('');
    });

    it('still returns the prices when saving the cover fails', async () => {
      // The prices are the answer; the picture is decoration, and a write
      // that fails must not take the search down with it.
      const game = { ...mockGame, coverUrl: '' };
      (
        service as unknown as { gameRepo: { update: jest.Mock } }
      ).gameRepo.update.mockRejectedValue(new Error('db down'));

      await expect(service.savePrices(game, [scraped()])).resolves.toHaveLength(
        1,
      );
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
        platform: 'pc',
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

    it('returns what it just saved, cheapest first', async () => {
      storeRepo.findOne!.mockResolvedValue(mockStore);
      priceRepo.findOne!.mockResolvedValue(null);
      priceRepo.create!.mockImplementation((v: unknown) => v);
      priceRepo.save!.mockImplementation((v: unknown) => Promise.resolve(v));

      const result = await service.savePrices(mockGame, [
        { ...scrapedPrice, price: 30, productUrl: 'https://a.test/1' },
        { ...scrapedPrice, price: 10, productUrl: 'https://a.test/2' },
      ]);

      expect(result.map((p) => p.price)).toEqual([10, 30]);
    });

    it('does not hand back rows from older scrapes', async () => {
      // It used to re-read every price attached to the game, which put back
      // the listings an older, looser pipeline had saved — other games
      // entirely, and PC-only rows from before platforms existed — right
      // after the filtering that removed them.
      storeRepo.findOne!.mockResolvedValue(mockStore);
      priceRepo.findOne!.mockResolvedValue(null);
      priceRepo.create!.mockImplementation((v: unknown) => v);
      priceRepo.save!.mockImplementation((v: unknown) => Promise.resolve(v));
      priceRepo.find!.mockResolvedValue([
        { id: 'stale', gameName: 'Lies Of P', price: 1 } as Price,
      ]);

      const result = await service.savePrices(mockGame, [scrapedPrice]);

      expect(result.map((p) => p.gameName)).toEqual(['Dark Souls']);
      expect(priceRepo.find).not.toHaveBeenCalled();
    });

    it('returns an updated row, not only the newly created ones', async () => {
      // A price that already existed is the common case on a re-scrape; if
      // only new rows came back the page would lose most of its results.
      storeRepo.findOne!.mockResolvedValue(mockStore);
      priceRepo.findOne!.mockResolvedValue({
        id: 'existing',
        gameName: 'Old Name',
      } as Price);
      priceRepo.save!.mockImplementation((v: unknown) => Promise.resolve(v));

      const result = await service.savePrices(mockGame, [scrapedPrice]);

      expect(result).toHaveLength(1);
      expect(result[0].gameName).toBe('Dark Souls');
      expect(priceRepo.create).not.toHaveBeenCalled();
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
