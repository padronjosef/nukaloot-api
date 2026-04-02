import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Game } from '../entities';

// We need to reset the module-level cache between tests.
// The cache is a module-level `const cache = {}` inside games.controller.ts.
// We can reset it by re-importing or by clearing the keys manually.
// Since the cache object is not exported, we clear it by running featured/upcoming
// with dates that invalidate the cache.

function makeAxiosResponse<T>(data: T): AxiosResponse<T> {
  const headers = new AxiosHeaders();
  const config: InternalAxiosRequestConfig = {
    headers: new AxiosHeaders(),
  };
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers,
    config,
  };
}

function makeAxiosError(status: number) {
  const error = new Error(`Request failed with status ${status}`) as Error & {
    response: { status: number };
  };
  error.response = { status };
  return error;
}

describe('GamesController', () => {
  let controller: GamesController;
  let gamesService: { search: jest.Mock };
  let httpService: { get: jest.Mock };

  beforeEach(async () => {
    gamesService = { search: jest.fn() };
    httpService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GamesController],
      providers: [
        { provide: GamesService, useValue: gamesService },
        { provide: HttpService, useValue: httpService },
        { provide: getRepositoryToken(Game), useValue: {} },
      ],
    }).compile();

    controller = module.get<GamesController>(GamesController);

    // Reset the module-level cache by manipulating the module internals.
    // We do this by jest.resetModules and re-requiring, but since we're
    // using NestJS DI, we'll instead just ensure our tests account for caching.
    // To truly reset cache, we clear it via dynamic import.
    jest.useFakeTimers();
    // Set time far in the future so cache from previous tests is stale
    jest.setSystemTime(Date.parse('2099-01-02T19:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('search', () => {
    it('delegates to GamesService.search with the query', async () => {
      const games = [{ id: '1', name: 'Elden Ring', slug: 'elden-ring' }];
      gamesService.search.mockResolvedValue(games);

      const result = await controller.search('elden');

      expect(gamesService.search).toHaveBeenCalledWith('elden');
      expect(result).toBe(games);
    });

    it('passes empty string when query is undefined', async () => {
      gamesService.search.mockResolvedValue([]);

      const result = await controller.search(undefined as unknown as string);

      expect(gamesService.search).toHaveBeenCalledWith('');
      expect(result).toEqual([]);
    });
  });

  describe('featured', () => {
    it('returns featured games from Steam API', async () => {
      const steamResponse = {
        large_capsules: [
          { name: 'Game One', id: 100, header_image: 'img1.jpg' },
        ],
        featured_win: [{ name: 'Game Two', id: 200, header_image: 'img2.jpg' }],
      };

      // Mock the featured API call
      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featured/?cc=us')) {
          return of(makeAxiosResponse(steamResponse));
        }
        // Mock appdetails calls (for NSFW filter) - return safe games
        if (url.includes('appdetails')) {
          const appId = url.match(/appids=(\d+)/)?.[1];
          return of(
            makeAxiosResponse({
              [appId!]: {
                data: { content_descriptors: { ids: [] }, required_age: 0 },
              },
            }),
          );
        }
        return of(makeAxiosResponse({}));
      });

      const result = await controller.featured();

      expect(result).toEqual({
        items: [
          { name: 'Game One', appId: 100, image: 'img1.jpg' },
          { name: 'Game Two', appId: 200, image: 'img2.jpg' },
        ],
      });
    });

    it('deduplicates games by id', async () => {
      const steamResponse = {
        large_capsules: [
          { name: 'Game One', id: 100, header_image: 'img1.jpg' },
        ],
        featured_win: [{ name: 'Game One', id: 100, header_image: 'img1.jpg' }],
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featured/?cc=us')) {
          return of(makeAxiosResponse(steamResponse));
        }
        if (url.includes('appdetails')) {
          const appId = url.match(/appids=(\d+)/)?.[1];
          return of(
            makeAxiosResponse({
              [appId!]: { data: { content_descriptors: { ids: [] } } },
            }),
          );
        }
        return of(makeAxiosResponse({}));
      });

      // Set a new time so cache from previous test is stale
      jest.setSystemTime(Date.parse('2099-01-03T19:00:00Z'));

      const result = await controller.featured();

      expect((result as { items: { name: string }[] }).items).toHaveLength(1);
    });

    it('filters NSFW games (content descriptor 3 or 4)', async () => {
      const steamResponse = {
        large_capsules: [
          { name: 'Safe Game', id: 100, header_image: 'safe.jpg' },
          { name: 'NSFW Game', id: 200, header_image: 'nsfw.jpg' },
        ],
        featured_win: [],
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featured/?cc=us')) {
          return of(makeAxiosResponse(steamResponse));
        }
        if (url.includes('appids=100')) {
          return of(
            makeAxiosResponse({
              '100': {
                data: { content_descriptors: { ids: [1, 2] }, required_age: 0 },
              },
            }),
          );
        }
        if (url.includes('appids=200')) {
          return of(
            makeAxiosResponse({
              '200': {
                data: {
                  content_descriptors: { ids: [3] },
                  required_age: 0,
                },
              },
            }),
          );
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-01-04T19:00:00Z'));

      const result = await controller.featured();

      expect((result as { items: { name: string }[] }).items).toHaveLength(1);
      expect((result as { items: { name: string }[] }).items[0].name).toBe(
        'Safe Game',
      );
    });

    it('filters games with required_age >= 18', async () => {
      const steamResponse = {
        large_capsules: [
          { name: 'Adult Game', id: 300, header_image: 'adult.jpg' },
        ],
        featured_win: [],
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featured/?cc=us')) {
          return of(makeAxiosResponse(steamResponse));
        }
        if (url.includes('appids=300')) {
          return of(
            makeAxiosResponse({
              '300': {
                data: { content_descriptors: { ids: [] }, required_age: 18 },
              },
            }),
          );
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-01-05T19:00:00Z'));

      const result = await controller.featured();

      expect((result as { items: { name: string }[] }).items).toHaveLength(0);
    });

    it('returns rateLimited flag on 403', async () => {
      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featured/?cc=us')) {
          return throwError(() => makeAxiosError(403));
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-01-06T19:00:00Z'));

      const result = await controller.featured();

      expect(result).toEqual({ rateLimited: true, items: [] });
    });

    it('returns rateLimited flag on 429', async () => {
      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featured/?cc=us')) {
          return throwError(() => makeAxiosError(429));
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-01-07T19:00:00Z'));

      const result = await controller.featured();

      expect(result).toEqual({ rateLimited: true, items: [] });
    });

    it('returns empty items on other errors', async () => {
      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featured/?cc=us')) {
          return throwError(() => new Error('network error'));
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-01-08T19:00:00Z'));

      const result = await controller.featured();

      expect(result).toEqual({ items: [] });
    });

    it('returns cached data on subsequent calls', async () => {
      const steamResponse = {
        large_capsules: [
          { name: 'Cached Game', id: 400, header_image: 'cached.jpg' },
        ],
        featured_win: [],
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featured/?cc=us')) {
          return of(makeAxiosResponse(steamResponse));
        }
        if (url.includes('appdetails')) {
          const appId = url.match(/appids=(\d+)/)?.[1];
          return of(
            makeAxiosResponse({
              [appId!]: {
                data: { content_descriptors: { ids: [] }, required_age: 0 },
              },
            }),
          );
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-02-01T19:00:00Z'));

      const result1 = await controller.featured();
      expect(httpService.get).toHaveBeenCalled();

      httpService.get.mockClear();
      const result2 = await controller.featured();

      // Should not call HTTP again due to cache
      expect(httpService.get).not.toHaveBeenCalled();
      expect(result2).toEqual(result1);
    });

    it('keeps game when appdetails call fails', async () => {
      const steamResponse = {
        large_capsules: [
          { name: 'Error Game', id: 500, header_image: 'err.jpg' },
        ],
        featured_win: [],
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featured/?cc=us')) {
          return of(makeAxiosResponse(steamResponse));
        }
        if (url.includes('appdetails')) {
          return throwError(() => new Error('timeout'));
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-02-02T19:00:00Z'));

      const result = await controller.featured();

      // On error, filterNsfw keeps the game
      expect((result as { items: { name: string }[] }).items).toHaveLength(1);
      expect((result as { items: { name: string }[] }).items[0].name).toBe(
        'Error Game',
      );
    });
  });

  describe('upcoming', () => {
    it('returns upcoming games from Steam API', async () => {
      const steamResponse = {
        coming_soon: {
          items: [{ name: 'Upcoming One', id: 600, header_image: 'up1.jpg' }],
        },
        new_releases: {
          items: [{ name: 'New Release', id: 700, header_image: 'new1.jpg' }],
        },
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featuredcategories')) {
          return of(makeAxiosResponse(steamResponse));
        }
        if (url.includes('appdetails')) {
          const appId = url.match(/appids=(\d+)/)?.[1];
          return of(
            makeAxiosResponse({
              [appId!]: {
                data: { content_descriptors: { ids: [] }, required_age: 0 },
              },
            }),
          );
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-03-01T19:00:00Z'));

      const result = await controller.upcoming();

      expect((result as { items: { name: string }[] }).items).toHaveLength(2);
      expect((result as { items: { name: string }[] }).items[0]).toEqual({
        name: 'Upcoming One',
        appId: 600,
        image: 'up1.jpg',
        url: 'https://store.steampowered.com/app/600',
      });
      expect((result as { items: { name: string }[] }).items[1]).toEqual({
        name: 'New Release',
        appId: 700,
        image: 'new1.jpg',
        url: 'https://store.steampowered.com/app/700',
      });
    });

    it('limits results to 12 items', async () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        name: `Game ${i}`,
        id: 1000 + i,
        header_image: `img${i}.jpg`,
      }));

      const steamResponse = {
        coming_soon: { items },
        new_releases: { items: [] },
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featuredcategories')) {
          return of(makeAxiosResponse(steamResponse));
        }
        if (url.includes('appdetails')) {
          const appId = url.match(/appids=(\d+)/)?.[1];
          return of(
            makeAxiosResponse({
              [appId!]: {
                data: { content_descriptors: { ids: [] }, required_age: 0 },
              },
            }),
          );
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-03-02T19:00:00Z'));

      const result = await controller.upcoming();

      expect((result as { items: { name: string }[] }).items).toHaveLength(12);
    });

    it('returns rateLimited flag on 403', async () => {
      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featuredcategories')) {
          return throwError(() => makeAxiosError(403));
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-03-03T19:00:00Z'));

      const result = await controller.upcoming();

      expect(result).toEqual({ rateLimited: true, items: [] });
    });

    it('returns rateLimited flag on 429', async () => {
      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featuredcategories')) {
          return throwError(() => makeAxiosError(429));
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-03-04T19:00:00Z'));

      const result = await controller.upcoming();

      expect(result).toEqual({ rateLimited: true, items: [] });
    });

    it('returns empty items on other errors', async () => {
      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featuredcategories')) {
          return throwError(() => new Error('connection refused'));
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-03-05T19:00:00Z'));

      const result = await controller.upcoming();

      expect(result).toEqual({ items: [] });
    });

    it('deduplicates games across coming_soon and new_releases', async () => {
      const steamResponse = {
        coming_soon: {
          items: [{ name: 'Same Game', id: 800, header_image: 'same.jpg' }],
        },
        new_releases: {
          items: [{ name: 'Same Game', id: 800, header_image: 'same.jpg' }],
        },
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featuredcategories')) {
          return of(makeAxiosResponse(steamResponse));
        }
        if (url.includes('appdetails')) {
          const appId = url.match(/appids=(\d+)/)?.[1];
          return of(
            makeAxiosResponse({
              [appId!]: {
                data: { content_descriptors: { ids: [] }, required_age: 0 },
              },
            }),
          );
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-03-06T19:00:00Z'));

      const result = await controller.upcoming();

      expect((result as { items: { name: string }[] }).items).toHaveLength(1);
    });

    it('returns cached data on subsequent calls', async () => {
      const steamResponse = {
        coming_soon: {
          items: [
            { name: 'Cached Upcoming', id: 900, header_image: 'cup.jpg' },
          ],
        },
        new_releases: { items: [] },
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featuredcategories')) {
          return of(makeAxiosResponse(steamResponse));
        }
        if (url.includes('appdetails')) {
          const appId = url.match(/appids=(\d+)/)?.[1];
          return of(
            makeAxiosResponse({
              [appId!]: {
                data: { content_descriptors: { ids: [] }, required_age: 0 },
              },
            }),
          );
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-04-01T19:00:00Z'));

      const result1 = await controller.upcoming();
      httpService.get.mockClear();

      const result2 = await controller.upcoming();
      expect(httpService.get).not.toHaveBeenCalled();
      expect(result2).toEqual(result1);
    });

    it('filters NSFW games from upcoming', async () => {
      const steamResponse = {
        coming_soon: {
          items: [
            { name: 'Clean Game', id: 1100, header_image: 'clean.jpg' },
            { name: 'Dirty Game', id: 1200, header_image: 'dirty.jpg' },
          ],
        },
        new_releases: { items: [] },
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.includes('featuredcategories')) {
          return of(makeAxiosResponse(steamResponse));
        }
        if (url.includes('appids=1100')) {
          return of(
            makeAxiosResponse({
              '1100': {
                data: { content_descriptors: { ids: [] }, required_age: 0 },
              },
            }),
          );
        }
        if (url.includes('appids=1200')) {
          return of(
            makeAxiosResponse({
              '1200': {
                data: {
                  content_descriptors: { ids: [4] },
                  required_age: 0,
                },
              },
            }),
          );
        }
        return of(makeAxiosResponse({}));
      });

      jest.setSystemTime(Date.parse('2099-04-02T19:00:00Z'));

      const result = await controller.upcoming();

      expect((result as { items: { name: string }[] }).items).toHaveLength(1);
      expect((result as { items: { name: string }[] }).items[0].name).toBe(
        'Clean Game',
      );
    });
  });
});
