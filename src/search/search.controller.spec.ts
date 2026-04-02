import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import type { Response } from 'express';
import { Game, Price, Store } from '../entities';
import { SteamIndex } from '../scrapers/scrapers.service';

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: jest.Mocked<SearchService>;

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
    id: 's1',
    name: 'Steam',
    url: 'https://store.steampowered.com',
    logoUrl: '',
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
      imageUrl: '',
      backgroundUrl: '',
      releaseDate: '',
      scrapedAt: new Date(),
      game: mockGame,
      store: mockStore,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        {
          provide: SearchService,
          useValue: {
            search: jest.fn(),
            searchFast: jest.fn(),
            searchSlow: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SearchController>(SearchController);
    searchService = module.get(SearchService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('search', () => {
    it('should throw BadRequestException when query is missing', () => {
      expect(() => controller.search(undefined as unknown as string)).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when query is empty string', () => {
      expect(() => controller.search('')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when query is too short (1 char)', () => {
      expect(() => controller.search('a')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when query is whitespace only', () => {
      expect(() => controller.search('   ')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message', () => {
      expect(() => controller.search('a')).toThrow(
        'Query parameter "q" is required (min 2 characters)',
      );
    });

    it('should accept 2-char query', () => {
      searchService.search.mockResolvedValue({
        game: mockGame,
        prices: mockPrices,
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
      });

      void controller.search('ds');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.search).toHaveBeenCalledWith('ds', 1, 12);
    });

    it('should default page to 1 and limit to 12', () => {
      searchService.search.mockResolvedValue({
        game: mockGame,
        prices: [],
        pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
      });

      void controller.search('Dark Souls');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.search).toHaveBeenCalledWith('Dark Souls', 1, 12);
    });

    it('should parse page and limit from strings', () => {
      searchService.search.mockResolvedValue({
        game: mockGame,
        prices: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      });

      void controller.search('Dark Souls', '2', '10');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.search).toHaveBeenCalledWith('Dark Souls', 2, 10);
    });

    it('should clamp page to minimum of 1', () => {
      searchService.search.mockResolvedValue({
        game: mockGame,
        prices: [],
        pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
      });

      void controller.search('Dark Souls', '0');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.search).toHaveBeenCalledWith('Dark Souls', 1, 12);
    });

    it('should clamp negative page to 1', () => {
      searchService.search.mockResolvedValue({
        game: mockGame,
        prices: [],
        pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
      });

      void controller.search('Dark Souls', '-5');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.search).toHaveBeenCalledWith('Dark Souls', 1, 12);
    });

    it('should clamp limit to maximum of 50', () => {
      searchService.search.mockResolvedValue({
        game: mockGame,
        prices: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      });

      void controller.search('Dark Souls', '1', '100');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.search).toHaveBeenCalledWith('Dark Souls', 1, 50);
    });

    it('should clamp limit to minimum of 1', () => {
      searchService.search.mockResolvedValue({
        game: mockGame,
        prices: [],
        pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
      });

      void controller.search('Dark Souls', '1', '0');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.search).toHaveBeenCalledWith('Dark Souls', 1, 12);
    });

    it('should handle non-numeric page gracefully (default to 1)', () => {
      searchService.search.mockResolvedValue({
        game: mockGame,
        prices: [],
        pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
      });

      void controller.search('Dark Souls', 'abc');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.search).toHaveBeenCalledWith('Dark Souls', 1, 12);
    });

    it('should handle non-numeric limit gracefully (default to 12)', () => {
      searchService.search.mockResolvedValue({
        game: mockGame,
        prices: [],
        pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
      });

      void controller.search('Dark Souls', '1', 'abc');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.search).toHaveBeenCalledWith('Dark Souls', 1, 12);
    });

    it('should trim query whitespace', () => {
      searchService.search.mockResolvedValue({
        game: mockGame,
        prices: [],
        pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
      });

      void controller.search('  Dark Souls  ');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.search).toHaveBeenCalledWith('Dark Souls', 1, 12);
    });
  });

  describe('stream', () => {
    let mockRes: Partial<Response>;
    let writtenData: string[];

    beforeEach(() => {
      writtenData = [];
      mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn().mockImplementation((data: string) => {
          writtenData.push(data);
          return true;
        }),
        end: jest.fn(),
      };
    });

    it('should throw BadRequestException when query is missing', async () => {
      await expect(
        controller.stream(
          undefined as unknown as string,
          'us',
          mockRes as Response,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when query is too short', async () => {
      await expect(
        controller.stream('a', 'us', mockRes as Response),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set SSE headers', async () => {
      searchService.searchFast.mockResolvedValue({
        game: mockGame,
        prices: mockPrices,
        steamIndex: null,
      });

      await controller.stream('Dark Souls', 'us', mockRes as Response);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache',
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Connection',
        'keep-alive',
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        '*',
      );

      expect(mockRes.flushHeaders).toHaveBeenCalled();
    });

    it('should send fast + done on cache hit (steamIndex is null)', async () => {
      searchService.searchFast.mockResolvedValue({
        game: mockGame,
        prices: mockPrices,
        steamIndex: null,
      });

      await controller.stream('Dark Souls', 'us', mockRes as Response);

      expect(writtenData).toHaveLength(2);

      const fastEvent = JSON.parse(
        writtenData[0].replace('data: ', '').trim(),
      ) as { type: string; [key: string]: unknown };
      expect(fastEvent.type).toBe('fast');
      expect(fastEvent.game).toEqual(JSON.parse(JSON.stringify(mockGame)));
      expect(fastEvent.prices).toEqual(JSON.parse(JSON.stringify(mockPrices)));

      const doneEvent = JSON.parse(
        writtenData[1].replace('data: ', '').trim(),
      ) as { type: string; [key: string]: unknown };
      expect(doneEvent.type).toBe('done');

      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should stream pending, fast, slow, and done on cache miss', async () => {
      const steamIndex: SteamIndex = { map: new Map() };
      const slowBatch = [
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

      searchService.searchFast.mockResolvedValue({
        game: mockGame,
        prices: mockPrices,
        steamIndex,
      });

      searchService.searchSlow.mockReturnValue(
        (async function* () {
          yield await Promise.resolve(slowBatch);
        })(),
      );

      await controller.stream('Dark Souls', 'us', mockRes as Response);

      expect(writtenData).toHaveLength(4);

      const pendingEvent = JSON.parse(
        writtenData[0].replace('data: ', '').trim(),
      ) as { type: string; [key: string]: unknown };
      expect(pendingEvent.type).toBe('pending');
      expect(pendingEvent.scrapers).toEqual(['Instant Gaming']);

      const fastEvent = JSON.parse(
        writtenData[1].replace('data: ', '').trim(),
      ) as { type: string; [key: string]: unknown };
      expect(fastEvent.type).toBe('fast');

      const slowEvent = JSON.parse(
        writtenData[2].replace('data: ', '').trim(),
      ) as { type: string; [key: string]: unknown };
      expect(slowEvent.type).toBe('slow');
      expect(slowEvent.prices).toEqual(slowBatch);

      const doneEvent = JSON.parse(
        writtenData[3].replace('data: ', '').trim(),
      ) as { type: string; [key: string]: unknown };
      expect(doneEvent.type).toBe('done');

      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should default cc to "us" when not provided', async () => {
      searchService.searchFast.mockResolvedValue({
        game: mockGame,
        prices: mockPrices,
        steamIndex: null,
      });

      await controller.stream(
        'Dark Souls',
        undefined as unknown as string,
        mockRes as Response,
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.searchFast).toHaveBeenCalledWith('Dark Souls', 'us');
    });

    it('should use provided cc region', async () => {
      searchService.searchFast.mockResolvedValue({
        game: mockGame,
        prices: mockPrices,
        steamIndex: null,
      });

      await controller.stream('Dark Souls', 'co', mockRes as Response);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.searchFast).toHaveBeenCalledWith('Dark Souls', 'co');
    });

    it('should trim query in stream', async () => {
      searchService.searchFast.mockResolvedValue({
        game: mockGame,
        prices: mockPrices,
        steamIndex: null,
      });

      await controller.stream('  Dark Souls  ', 'us', mockRes as Response);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(searchService.searchFast).toHaveBeenCalledWith('Dark Souls', 'us');
    });

    it('should handle multiple slow batches', async () => {
      const steamIndex: SteamIndex = { map: new Map() };
      const batch1 = [
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
      const batch2 = [
        {
          storeName: 'Instant Gaming',
          storeUrl: 'https://instantgaming.com',
          price: 12.99,
          currency: 'USD',
          productUrl: 'https://instantgaming.com/2',
          gameName: 'Dark Souls II',
          gameType: 'game' as const,
          imageUrl: '',
          backgroundUrl: '',
          releaseDate: '',
        },
      ];

      searchService.searchFast.mockResolvedValue({
        game: mockGame,
        prices: mockPrices,
        steamIndex,
      });

      searchService.searchSlow.mockReturnValue(
        (async function* () {
          yield await Promise.resolve(batch1);
          yield await Promise.resolve(batch2);
        })(),
      );

      await controller.stream('Dark Souls', 'us', mockRes as Response);

      // pending + fast + slow1 + slow2 + done = 5
      expect(writtenData).toHaveLength(5);

      const slowEvent1 = JSON.parse(
        writtenData[2].replace('data: ', '').trim(),
      ) as { type: string; [key: string]: unknown };
      expect(slowEvent1.type).toBe('slow');
      expect(slowEvent1.prices).toEqual(batch1);

      const slowEvent2 = JSON.parse(
        writtenData[3].replace('data: ', '').trim(),
      ) as { type: string; [key: string]: unknown };
      expect(slowEvent2.type).toBe('slow');
      expect(slowEvent2.prices).toEqual(batch2);
    });
  });
});
