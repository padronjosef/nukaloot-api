import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { CheapSharkScraper } from './cheapshark.scraper';
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

function makeDeal(overrides: Record<string, string> = {}) {
  return {
    title: 'Test Game',
    salePrice: '9.99',
    normalPrice: '19.99',
    dealID: 'abc123',
    storeID: '1',
    metacriticScore: '85',
    thumb: 'https://thumb.example.com/img.jpg',
    steamAppID: '570',
    ...overrides,
  };
}

describe('CheapSharkScraper', () => {
  let scraper: CheapSharkScraper;
  let httpService: { get: jest.Mock };

  beforeEach(() => {
    httpService = { get: jest.fn() };
    scraper = new CheapSharkScraper(httpService as unknown as HttpService);
  });

  it('should have storeName "CheapShark"', () => {
    expect(scraper.storeName).toBe('CheapShark');
  });

  describe('search', () => {
    it('should call the CheapShark API with correct params', async () => {
      httpService.get.mockReturnValue(of(axiosResponse([])));
      await scraper.search('dark souls');
      expect(httpService.get).toHaveBeenCalledWith(
        'https://www.cheapshark.com/api/1.0/deals',
        { params: { title: 'dark souls', sortBy: 'Price', pageSize: 60 } },
      );
    });

    it('should return empty array when no deals found', async () => {
      httpService.get.mockReturnValue(of(axiosResponse([])));
      const result = await scraper.search('nonexistent');
      expect(result).toEqual([]);
    });

    it('should return empty array when data is null', async () => {
      httpService.get.mockReturnValue(of(axiosResponse(null)));
      const result = await scraper.search('test');
      expect(result).toEqual([]);
    });

    it('should map deal to ScrapedPrice correctly', async () => {
      httpService.get.mockReturnValue(of(axiosResponse([makeDeal()])));
      const result = await scraper.search('test');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        storeName: 'Steam',
        storeUrl: 'https://www.cheapshark.com',
        gameName: 'Test Game',
        price: 9.99,
        originalPrice: 19.99,
        currency: 'USD',
        productUrl: 'https://www.cheapshark.com/redirect?dealID=abc123',
        gameType: 'unknown',
        imageUrl:
          'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/header.jpg',
        backgroundUrl: '',
        releaseDate: '',
      });
    });

    it('should set originalPrice to undefined when sale equals normal price', async () => {
      httpService.get.mockReturnValue(
        of(
          axiosResponse([makeDeal({ salePrice: '9.99', normalPrice: '9.99' })]),
        ),
      );
      const result = await scraper.search('test');
      expect(result[0].originalPrice).toBeUndefined();
    });

    it('should set originalPrice when sale differs from normal price', async () => {
      httpService.get.mockReturnValue(
        of(
          axiosResponse([
            makeDeal({ salePrice: '5.00', normalPrice: '19.99' }),
          ]),
        ),
      );
      const result = await scraper.search('test');
      expect(result[0].originalPrice).toBe(19.99);
    });

    it('should use steam image URL when steamAppID is present', async () => {
      httpService.get.mockReturnValue(
        of(axiosResponse([makeDeal({ steamAppID: '12345' })])),
      );
      const result = await scraper.search('test');
      expect(result[0].imageUrl).toBe(
        'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/12345/header.jpg',
      );
    });

    it('should use thumb when steamAppID is null', async () => {
      const deal = makeDeal();
      // Setting steamAppID to null requires overriding the whole deal
      httpService.get.mockReturnValue(
        of(
          axiosResponse([
            {
              ...deal,
              steamAppID: null,
              thumb: 'https://thumb.example.com/img.jpg',
            },
          ]),
        ),
      );
      const result = await scraper.search('test');
      expect(result[0].imageUrl).toBe('https://thumb.example.com/img.jpg');
    });

    it('should use empty string when steamAppID is null and thumb is empty', async () => {
      httpService.get.mockReturnValue(
        of(axiosResponse([{ ...makeDeal(), steamAppID: null, thumb: '' }])),
      );
      const result = await scraper.search('test');
      expect(result[0].imageUrl).toBe('');
    });

    describe('store ID mapping', () => {
      const storeMap: [string, string][] = [
        ['1', 'Steam'],
        ['2', 'GamersGate'],
        ['3', 'GreenManGaming'],
        ['7', 'GOG'],
        ['8', 'Origin'],
        ['11', 'Humble Store'],
        ['13', 'Uplay'],
        ['15', 'Fanatical'],
        ['21', 'WinGameStore'],
        ['23', 'GameBillet'],
        ['24', 'Voidu'],
        ['25', 'Epic Games Store'],
        ['27', 'Games Planet'],
        ['28', 'Gamesload'],
        ['29', '2Game'],
        ['30', 'IndieGala'],
        ['31', 'Blizzard Shop'],
        ['33', 'DLGamer'],
        ['34', 'Noctre'],
        ['35', 'DreamGame'],
      ];

      for (const [storeID, storeName] of storeMap) {
        it(`should map storeID ${storeID} to "${storeName}"`, async () => {
          httpService.get.mockReturnValue(
            of(axiosResponse([makeDeal({ storeID })])),
          );
          const result = await scraper.search('test');
          expect(result[0].storeName).toBe(storeName);
        });
      }

      it('should fall back to "Store #ID" for unknown store IDs', async () => {
        httpService.get.mockReturnValue(
          of(axiosResponse([makeDeal({ storeID: '999' })])),
        );
        const result = await scraper.search('test');
        expect(result[0].storeName).toBe('Store #999');
      });
    });

    it('should always set gameType to "unknown"', async () => {
      httpService.get.mockReturnValue(of(axiosResponse([makeDeal()])));
      const result = await scraper.search('test');
      expect(result[0].gameType).toBe('unknown');
    });

    it('should always set currency to "USD"', async () => {
      httpService.get.mockReturnValue(of(axiosResponse([makeDeal()])));
      const result = await scraper.search('test');
      expect(result[0].currency).toBe('USD');
    });

    it('should handle multiple deals', async () => {
      httpService.get.mockReturnValue(
        of(
          axiosResponse([
            makeDeal({ storeID: '1', title: 'Game A' }),
            makeDeal({ storeID: '7', title: 'Game B' }),
            makeDeal({ storeID: '25', title: 'Game C' }),
          ]),
        ),
      );
      const result = await scraper.search('game');
      expect(result).toHaveLength(3);
      expect(result[0].storeName).toBe('Steam');
      expect(result[1].storeName).toBe('GOG');
      expect(result[2].storeName).toBe('Epic Games Store');
    });

    it('should return empty array on API failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );
      const result = await scraper.search('test');
      expect(result).toEqual([]);
    });

    it('should construct correct product URL with dealID', async () => {
      httpService.get.mockReturnValue(
        of(axiosResponse([makeDeal({ dealID: 'xyz789' })])),
      );
      const result = await scraper.search('test');
      expect(result[0].productUrl).toBe(
        'https://www.cheapshark.com/redirect?dealID=xyz789',
      );
    });

    it('should set backgroundUrl to empty string', async () => {
      httpService.get.mockReturnValue(of(axiosResponse([makeDeal()])));
      const result = await scraper.search('test');
      expect(result[0].backgroundUrl).toBe('');
    });

    it('should set releaseDate to empty string', async () => {
      httpService.get.mockReturnValue(of(axiosResponse([makeDeal()])));
      const result = await scraper.search('test');
      expect(result[0].releaseDate).toBe('');
    });
  });
});
