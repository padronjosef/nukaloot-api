import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { SteamScraper } from './steam.scraper';
import { AxiosResponse, AxiosHeaders } from 'axios';

function axiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

describe('SteamScraper', () => {
  let scraper: SteamScraper;
  let httpService: { get: jest.Mock };

  beforeEach(() => {
    httpService = { get: jest.fn() };
    scraper = new SteamScraper(httpService as unknown as HttpService);
  });

  it('should have storeName "Steam"', () => {
    expect(scraper.storeName).toBe('Steam');
  });

  describe('search', () => {
    it('should return empty array when no items found', async () => {
      httpService.get.mockReturnValue(of(axiosResponse({ items: [] })));
      const result = await scraper.search('nonexistent');
      expect(result).toEqual([]);
    });

    it('should return empty array when data is null', async () => {
      httpService.get.mockReturnValue(of(axiosResponse(null)));
      const result = await scraper.search('test');
      expect(result).toEqual([]);
    });

    it('should return empty array when items is undefined', async () => {
      httpService.get.mockReturnValue(of(axiosResponse({})));
      const result = await scraper.search('test');
      expect(result).toEqual([]);
    });

    it('should call store search API with correct params', async () => {
      httpService.get.mockReturnValue(of(axiosResponse({ items: [] })));
      await scraper.search('dark souls', 'gb');
      expect(httpService.get).toHaveBeenCalledWith(
        'https://store.steampowered.com/api/storesearch/',
        { params: { term: 'dark souls', l: 'english', cc: 'gb' } },
      );
    });

    it('should default cc to "us"', async () => {
      httpService.get.mockReturnValue(of(axiosResponse({ items: [] })));
      await scraper.search('test');
      expect(httpService.get).toHaveBeenCalledWith(
        'https://store.steampowered.com/api/storesearch/',
        { params: { term: 'test', l: 'english', cc: 'us' } },
      );
    });

    it('should fetch app details and return scraped prices', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 570, name: 'Dota 2' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '570': {
                data: {
                  name: 'Dota 2',
                  type: 'game',
                  price_overview: {
                    final: 999,
                    initial: 1999,
                    currency: 'USD',
                  },
                  header_image: 'https://cdn.steam/570/header.jpg',
                  background_raw: 'https://cdn.steam/570/bg.jpg',
                  release_date: { date: 'Jul 9, 2013' },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('dota');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        storeName: 'Steam',
        storeUrl: 'https://store.steampowered.com',
        gameName: 'Dota 2',
        price: 9.99,
        originalPrice: 19.99,
        currency: 'USD',
        productUrl: 'https://store.steampowered.com/app/570',
        gameType: 'game',
        imageUrl: 'https://cdn.steam/570/header.jpg',
        backgroundUrl: 'https://cdn.steam/570/bg.jpg',
        releaseDate: 'Jul 9, 2013',
      });
    });

    it('should divide prices by 100', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'Game' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'Game',
                  type: 'game',
                  price_overview: {
                    final: 4999,
                    initial: 4999,
                    currency: 'EUR',
                  },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('game');
      expect(result[0].price).toBe(49.99);
      expect(result[0].originalPrice).toBeUndefined();
      expect(result[0].currency).toBe('EUR');
    });

    it('should set originalPrice to undefined when initial equals final', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'Game' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'Game',
                  type: 'game',
                  price_overview: {
                    final: 1000,
                    initial: 1000,
                    currency: 'USD',
                  },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('game');
      expect(result[0].originalPrice).toBeUndefined();
    });

    it('should set originalPrice when initial differs from final', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'Game' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'Game',
                  type: 'game',
                  price_overview: {
                    final: 500,
                    initial: 1000,
                    currency: 'USD',
                  },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('game');
      expect(result[0].originalPrice).toBe(10);
    });

    it('should map type "game" to gameType "game"', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'G' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'G',
                  type: 'game',
                  price_overview: { final: 100, initial: 100, currency: 'USD' },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('g');
      expect(result[0].gameType).toBe('game');
    });

    it('should map type "dlc" to gameType "dlc"', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'D' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'D',
                  type: 'dlc',
                  price_overview: { final: 100, initial: 100, currency: 'USD' },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('d');
      expect(result[0].gameType).toBe('dlc');
    });

    it('should map type "bundle" to gameType "bundle"', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'B' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'B',
                  type: 'bundle',
                  price_overview: { final: 100, initial: 100, currency: 'USD' },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('b');
      expect(result[0].gameType).toBe('bundle');
    });

    it('should map type "sub" to gameType "bundle"', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'S' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'S',
                  type: 'sub',
                  price_overview: { final: 100, initial: 100, currency: 'USD' },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('s');
      expect(result[0].gameType).toBe('bundle');
    });

    it('should map unknown type to gameType "unknown"', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'X' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'X',
                  type: 'video',
                  price_overview: { final: 100, initial: 100, currency: 'USD' },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('x');
      expect(result[0].gameType).toBe('other');
    });

    it('should default to gameType "unknown" when type is missing', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'X' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'X',
                  price_overview: { final: 100, initial: 100, currency: 'USD' },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('x');
      expect(result[0].gameType).toBe('other');
    });

    it('should skip items without price_overview', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(
            axiosResponse({
              items: [
                { id: 1, name: 'Free' },
                { id: 2, name: 'Paid' },
              ],
            }),
          ),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': { data: { name: 'Free', type: 'game' } },
            }),
          ),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '2': {
                data: {
                  name: 'Paid',
                  type: 'game',
                  price_overview: { final: 100, initial: 100, currency: 'USD' },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('test');
      expect(result).toHaveLength(1);
      expect(result[0].gameName).toBe('Paid');
    });

    it('should handle individual app detail failures gracefully', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(
            axiosResponse({
              items: [
                { id: 1, name: 'Fail' },
                { id: 2, name: 'Ok' },
              ],
            }),
          ),
        )
        .mockReturnValueOnce(throwError(() => new Error('Network error')))
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '2': {
                data: {
                  name: 'Ok',
                  type: 'game',
                  price_overview: { final: 500, initial: 500, currency: 'USD' },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('test');
      expect(result).toHaveLength(1);
      expect(result[0].gameName).toBe('Ok');
    });

    it('should return empty array on store search API failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );
      const result = await scraper.search('test');
      expect(result).toEqual([]);
    });

    it('should limit to 60 items from store search', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Game ${i}`,
      }));
      httpService.get.mockReturnValueOnce(of(axiosResponse({ items })));

      // Mock all appdetails calls to return no price_overview (simplest way)
      for (let i = 0; i < 60; i++) {
        httpService.get.mockReturnValueOnce(
          of(axiosResponse({ [String(i)]: { data: { name: `Game ${i}` } } })),
        );
      }

      await scraper.search('game');
      // 1 store search + 60 appdetails = 61 calls total
      expect(httpService.get).toHaveBeenCalledTimes(61);
    });

    it('should use empty string for missing header_image', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'G' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'G',
                  type: 'game',
                  price_overview: { final: 100, initial: 100, currency: 'USD' },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('g');
      expect(result[0].imageUrl).toBe('');
      expect(result[0].backgroundUrl).toBe('');
      expect(result[0].releaseDate).toBe('');
    });

    it('should default currency to USD when not provided', async () => {
      httpService.get
        .mockReturnValueOnce(
          of(axiosResponse({ items: [{ id: 1, name: 'G' }] })),
        )
        .mockReturnValueOnce(
          of(
            axiosResponse({
              '1': {
                data: {
                  name: 'G',
                  type: 'game',
                  price_overview: {
                    final: 100,
                    initial: 100,
                    currency: '',
                  },
                },
              },
            }),
          ),
        );

      const result = await scraper.search('g');
      expect(result[0].currency).toBe('USD');
    });
  });
});
