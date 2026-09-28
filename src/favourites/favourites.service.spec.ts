import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Favourite, Price, User } from '../entities';
import { GamesService } from '../games/games.service';
import { FavouritesService } from './favourites.service';

/**
 * This is the money path. A favourite shows one price per game, and if that
 * price is for a machine the person does not own they can buy a key that will
 * never work and cannot be refunded. Every case below is written from that
 * failure backwards, so the tests that matter most are the ones asserting what
 * is NOT shown.
 */
describe('FavouritesService', () => {
  let service: FavouritesService;
  let repo: {
    count: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let users: { findOne: jest.Mock; update: jest.Mock };
  let games: { findOrCreate: jest.Mock };
  /** Rows the price query returns, cheapest first, as SQL would order them. */
  let priceRows: unknown[];

  const game = {
    id: 'game-1',
    name: 'Elden Ring',
    slug: 'elden-ring',
    coverUrl: '',
  };

  const priceRow = (over: {
    gameId?: string;
    price: number;
    platform?: unknown;
    store?: string;
    url?: string;
    /** The listing's title, when it differs from the game it is attached to. */
    gameName?: string;
    /** The game row's own name, i.e. what was searched for. */
    gameTitle?: string;
  }) => ({
    id: `price-${over.price}-${String(over.platform)}`,
    price: over.price,
    currency: 'USD',
    productUrl: over.url ?? `https://example.test/${over.price}`,
    platform: 'platform' in over ? over.platform : 'pc',
    scrapedAt: new Date('2026-09-18T00:00:00Z'),
    store: { name: over.store ?? 'Kinguin' },
    // The listing's own title. Defaults to the game's, since that is the
    // normal case; the tests that care set it apart on purpose.
    gameName: over.gameName ?? game.name,
    game: { id: over.gameId ?? game.id, name: over.gameTitle ?? game.name },
  });

  /** A saved game, following the account unless given its own platforms. */
  const favouriteRow = (over: Record<string, unknown> = {}) => ({
    userId: 'user-1',
    gameId: game.id,
    game,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    source: 'manual',
    tracked: true,
    priceWhenAdded: null,
    platforms: null,
    ...over,
  });

  /** Sorted cheapest first so the fake behaves like `ORDER BY p.price ASC`. */
  const givenPrices = (...rows: ReturnType<typeof priceRow>[]) => {
    priceRows = [...rows].sort((a, b) => a.price - b.price);
  };

  const givenAccountPlatforms = (platforms: unknown) => {
    users.findOne.mockResolvedValue({
      id: 'user-1',
      trackedPlatforms: platforms,
    });
  };

  beforeEach(async () => {
    process.env.FAVOURITES_PER_USER = '2';
    priceRows = [];

    repo = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((v: unknown) => v),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    };
    users = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', trackedPlatforms: null }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    games = { findOrCreate: jest.fn().mockResolvedValue(game) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FavouritesService,
        { provide: getRepositoryToken(Favourite), useValue: repo },
        {
          provide: getRepositoryToken(Price),
          useValue: {
            createQueryBuilder: jest.fn(() => ({
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              addOrderBy: jest.fn().mockReturnThis(),
              getMany: jest
                .fn()
                .mockImplementation(() => Promise.resolve(priceRows)),
            })),
          },
        },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: GamesService, useValue: games },
      ],
    }).compile();

    service = moduleRef.get(FavouritesService);
  });

  it('counts only what is being tracked', async () => {
    await service.countTracked('user-1');
    expect(repo.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', tracked: true },
    });
  });

  describe('the account setting it reports', () => {
    // The list endpoint hands this straight to the client, which paints the
    // toggles with it. Junk in the column must not become junk on screen.
    it('gives back what was stored', async () => {
      givenAccountPlatforms(['pc', 'nintendo']);
      await expect(service.platformsFor('user-1')).resolves.toEqual([
        'pc',
        'nintendo',
      ]);
    });

    it.each([
      ['never set', null],
      ['stored empty', []],
      ['stored as junk', ['ps5', 'dreamcast']],
      ['stored as a string', 'pc,xbox'],
    ])('reports PC when it is %s', async (_label, stored) => {
      givenAccountPlatforms(stored);
      await expect(service.platformsFor('user-1')).resolves.toEqual(['pc']);
    });

    it('drops only the unknown part of a mixed setting', async () => {
      givenAccountPlatforms(['xbox', 'ps5']);
      await expect(service.platformsFor('user-1')).resolves.toEqual(['xbox']);
    });

    it('reports PC for an account that is gone', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(service.platformsFor('ghost')).resolves.toEqual(['pc']);
    });
  });

  describe('the price it shows', () => {
    it('never shows a console price to somebody who only has a PC', async () => {
      // The bug this exists for: the PS5 key is genuinely the cheapest, and
      // showing it sells a key for a machine they do not own.
      repo.find.mockResolvedValue([favouriteRow()]);
      givenAccountPlatforms(['pc']);
      givenPrices(
        priceRow({ price: 21.93, platform: 'playstation', store: 'Eneba' }),
        priceRow({ price: 26.99, platform: 'pc', store: 'Instant Gaming' }),
      );

      const [item] = await service.listFor('user-1');

      expect(item.bestPrice).toBe(26.99);
      expect(item.storeName).toBe('Instant Gaming');
      expect(item.platform).toBe('pc');
    });

    it('shows no price at all when every listing is for the wrong machine', async () => {
      // A blank is honest. Falling back to "the cheapest we have" would put
      // the console key right back on the page.
      repo.find.mockResolvedValue([favouriteRow()]);
      givenAccountPlatforms(['pc']);
      givenPrices(
        priceRow({ price: 21.93, platform: 'playstation' }),
        priceRow({ price: 25, platform: 'xbox' }),
      );

      const [item] = await service.listFor('user-1');

      expect(item.bestPrice).toBeNull();
      expect(item.storeName).toBeNull();
      expect(item.productUrl).toBeNull();
      expect(item.currency).toBeNull();
      expect(item.scrapedAt).toBeNull();
      expect(item.platform).toBeNull();
      // The game itself stays on the list — it is watched, just not priced.
      expect(item.gameId).toBe(game.id);
    });

    it('ignores a listing for a different game that got saved here', async () => {
      // Searches used to save whatever the store recommended, so the prices
      // attached to "Elden Ring" include rows for Lies of P. The cheapest of
      // those must not become this game's best price.
      repo.find.mockResolvedValue([favouriteRow()]);
      givenAccountPlatforms(['pc']);
      givenPrices(
        priceRow({ price: 3, gameName: 'Lies Of P Deluxe Edition' }),
        priceRow({ price: 8, gameName: "Death's Door" }),
        priceRow({ price: 44, gameName: 'Elden Ring Deluxe Edition' }),
      );

      const [item] = await service.listFor('user-1');

      expect(item.bestPrice).toBe(44);
    });

    it('keeps a listing whose title is a variant of the game', async () => {
      repo.find.mockResolvedValue([favouriteRow()]);
      givenAccountPlatforms(['pc']);
      givenPrices(
        priceRow({ price: 20, gameName: 'Elden Ring - Pc (Steam) GLOBAL' }),
      );

      const [item] = await service.listFor('user-1');

      expect(item.bestPrice).toBe(20);
    });

    it('takes every field of the price from the same listing', async () => {
      // A price from one row with the store or link of another would send
      // somebody to a page showing a different number.
      repo.find.mockResolvedValue([favouriteRow()]);
      givenAccountPlatforms(['pc']);
      givenPrices(
        priceRow({
          price: 9,
          platform: 'nintendo',
          store: 'Eneba',
          url: 'https://example.test/switch',
        }),
        priceRow({
          price: 40,
          platform: 'pc',
          store: 'Kinguin',
          url: 'https://example.test/pc',
        }),
      );

      const [item] = await service.listFor('user-1');

      expect(item).toMatchObject({
        bestPrice: 40,
        storeName: 'Kinguin',
        productUrl: 'https://example.test/pc',
        platform: 'pc',
      });
    });

    it('shows the console price once that console is asked for', async () => {
      repo.find.mockResolvedValue([favouriteRow()]);
      givenAccountPlatforms(['pc', 'playstation']);
      givenPrices(
        priceRow({ price: 21.93, platform: 'playstation', store: 'Eneba' }),
        priceRow({ price: 26.99, platform: 'pc' }),
      );

      const [item] = await service.listFor('user-1');

      expect(item.bestPrice).toBe(21.93);
      expect(item.platform).toBe('playstation');
    });

    it('picks the cheapest within the wanted platforms, not merely the first', async () => {
      repo.find.mockResolvedValue([favouriteRow()]);
      givenAccountPlatforms(['pc']);
      givenPrices(
        priceRow({ price: 5, platform: 'xbox' }),
        priceRow({ price: 30, platform: 'pc', store: 'Dear' }),
        priceRow({ price: 12, platform: 'pc', store: 'Cheap' }),
      );

      const [item] = await service.listFor('user-1');

      expect(item.bestPrice).toBe(12);
      expect(item.storeName).toBe('Cheap');
    });

    it.each([
      ['null', null],
      ['the old column default', 'unknown'],
      ['an empty string', ''],
      ['a value from a newer scraper', 'steamdeck'],
    ])('treats a price whose platform is %s as PC', async (_label, stored) => {
      repo.find.mockResolvedValue([favouriteRow()]);
      givenAccountPlatforms(['pc']);
      givenPrices(priceRow({ price: 10, platform: stored }));

      const [pcUser] = await service.listFor('user-1');
      expect(pcUser.bestPrice).toBe(10);

      // ...and therefore it must NOT show up for a PlayStation-only person.
      givenAccountPlatforms(['playstation']);
      const [psUser] = await service.listFor('user-1');
      expect(psUser.bestPrice).toBeNull();
    });
  });

  describe('whose preference wins', () => {
    it('defaults to PC for an account that never chose', async () => {
      repo.find.mockResolvedValue([favouriteRow()]);
      givenAccountPlatforms(null);
      givenPrices(
        priceRow({ price: 5, platform: 'playstation' }),
        priceRow({ price: 50, platform: 'pc' }),
      );

      const [item] = await service.listFor('user-1');
      expect(item.bestPrice).toBe(50);
      expect(item.platforms).toEqual(['pc']);
    });

    it('defaults to PC when the account row has gone missing', async () => {
      // A deleted account mid-request must not widen the filter to everything.
      repo.find.mockResolvedValue([favouriteRow()]);
      users.findOne.mockResolvedValue(null);
      givenPrices(priceRow({ price: 5, platform: 'playstation' }));

      const [item] = await service.listFor('user-1');
      expect(item.bestPrice).toBeNull();
    });

    it('defaults to PC when the stored preference is junk', async () => {
      repo.find.mockResolvedValue([favouriteRow()]);
      givenAccountPlatforms(['ps5', 'megadrive']);
      givenPrices(
        priceRow({ price: 5, platform: 'playstation' }),
        priceRow({ price: 50, platform: 'pc' }),
      );

      const [item] = await service.listFor('user-1');
      expect(item.bestPrice).toBe(50);
    });

    it('lets one game override the account', async () => {
      repo.find.mockResolvedValue([favouriteRow({ platforms: ['nintendo'] })]);
      givenAccountPlatforms(['pc']);
      givenPrices(
        priceRow({ price: 5, platform: 'pc' }),
        priceRow({ price: 60, platform: 'nintendo' }),
      );

      const [item] = await service.listFor('user-1');
      expect(item.bestPrice).toBe(60);
      expect(item.platform).toBe('nintendo');
      expect(item.platformsAreOwn).toBe(true);
    });

    it('treats a stored empty override as following the account', async () => {
      repo.find.mockResolvedValue([favouriteRow({ platforms: [] })]);
      givenAccountPlatforms(['xbox']);
      givenPrices(
        priceRow({ price: 5, platform: 'pc' }),
        priceRow({ price: 60, platform: 'xbox' }),
      );

      const [item] = await service.listFor('user-1');
      expect(item.bestPrice).toBe(60);
      expect(item.platformsAreOwn).toBe(false);
    });

    it('keeps each game to its own platforms when several are on the list', async () => {
      // One game's override must not leak into the next one's price.
      repo.find.mockResolvedValue([
        favouriteRow({ gameId: 'game-1', platforms: ['pc'] }),
        favouriteRow({
          gameId: 'game-2',
          platforms: ['playstation'],
          game: { ...game, id: 'game-2', name: 'Other' },
        }),
      ]);
      givenAccountPlatforms(['pc']);
      givenPrices(
        priceRow({ gameId: 'game-1', price: 3, platform: 'playstation' }),
        priceRow({ gameId: 'game-1', price: 30, platform: 'pc' }),
        priceRow({ gameId: 'game-2', price: 7, platform: 'playstation' }),
        priceRow({ gameId: 'game-2', price: 70, platform: 'pc' }),
      );

      const items = await service.listFor('user-1');
      const byId = new Map(items.map((i) => [i.gameId, i]));

      expect(byId.get('game-1')!.bestPrice).toBe(30);
      expect(byId.get('game-1')!.platform).toBe('pc');
      expect(byId.get('game-2')!.bestPrice).toBe(7);
      expect(byId.get('game-2')!.platform).toBe('playstation');
    });

    it("reads only the caller's own list", async () => {
      repo.find.mockResolvedValue([]);
      await service.listFor('user-1');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
    });
  });

  describe('adding', () => {
    it('records the price on the platforms they own, not the global cheapest', async () => {
      // Otherwise "cheaper than when you added it" is measured against a
      // console price they were never going to buy.
      givenAccountPlatforms(['pc']);
      givenPrices(
        priceRow({ price: 5, platform: 'playstation' }),
        priceRow({ price: 40, platform: 'pc' }),
      );
      repo.find.mockResolvedValue([favouriteRow({ priceWhenAdded: 40 })]);

      await service.add('user-1', 'Elden Ring');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ priceWhenAdded: 40 }),
      );
    });

    it('records no starting price when nothing is priced for their machines', async () => {
      givenAccountPlatforms(['pc']);
      givenPrices(priceRow({ price: 5, platform: 'playstation' }));
      repo.find.mockResolvedValue([favouriteRow()]);

      await service.add('user-1', 'Elden Ring');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ priceWhenAdded: null }),
      );
    });

    describe('what it must refuse', () => {
      it('refuses to track one more than the limit', async () => {
        repo.count.mockResolvedValue(2);
        await expect(service.add('user-1', 'Elden Ring')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('says how to make room rather than just saying no', async () => {
        repo.count.mockResolvedValue(2);
        await expect(service.add('user-1', 'Elden Ring')).rejects.toThrow(
          /untrack one/i,
        );
      });
    });

    it('lets you re-add a game you already have while at the limit', async () => {
      // Saving something already saved changes nothing, so refusing it is a
      // dead end: the heart looks broken and there is nothing to remove.
      repo.count.mockResolvedValue(2);
      repo.findOne.mockResolvedValue({ userId: 'user-1', gameId: game.id });
      repo.find.mockResolvedValue([favouriteRow()]);

      await expect(service.add('user-1', 'Elden Ring')).resolves.toMatchObject({
        gameId: game.id,
      });
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('setting the account platforms', () => {
    it('stores what was asked for', async () => {
      await expect(
        service.setPlatforms('user-1', ['pc', 'xbox']),
      ).resolves.toEqual(['pc', 'xbox']);
      expect(users.update).toHaveBeenCalledWith(
        { id: 'user-1' },
        { trackedPlatforms: ['pc', 'xbox'] },
      );
    });

    it('never stores an empty list', async () => {
      // An empty stored preference would later read as "no filter" somewhere
      // and put console keys back in front of a PC buyer.
      await expect(service.setPlatforms('user-1', [])).resolves.toEqual(['pc']);
      expect(users.update).toHaveBeenCalledWith(
        { id: 'user-1' },
        { trackedPlatforms: ['pc'] },
      );
    });

    it('never stores a platform it does not know', async () => {
      await expect(
        service.setPlatforms('user-1', ['pc', 'ps5', 'dreamcast']),
      ).resolves.toEqual(['pc']);
    });

    it('fails loudly when the account does not exist', async () => {
      users.update.mockResolvedValue({ affected: 0 });
      await expect(service.setPlatforms('ghost', ['pc'])).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("setting one game's platforms", () => {
    it('stores the override', async () => {
      await expect(
        service.setGamePlatforms('user-1', game.id, ['playstation']),
      ).resolves.toEqual(['playstation']);
      expect(repo.update).toHaveBeenCalledWith(
        { userId: 'user-1', gameId: game.id },
        { platforms: ['playstation'] },
      );
    });

    it('clears the override with null and reports the account setting', async () => {
      givenAccountPlatforms(['xbox']);
      await expect(
        service.setGamePlatforms('user-1', game.id, null),
      ).resolves.toEqual(['xbox']);
      expect(repo.update).toHaveBeenCalledWith(
        { userId: 'user-1', gameId: game.id },
        { platforms: null },
      );
    });

    it('scopes the write to the caller, so nobody edits another list', async () => {
      await service.setGamePlatforms('user-1', game.id, ['pc']);
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        expect.anything(),
      );
    });

    it('refuses a game that is not on the list', async () => {
      repo.update.mockResolvedValue({ affected: 0 });
      await expect(
        service.setGamePlatforms('user-1', 'not-mine', ['pc']),
      ).rejects.toThrow(NotFoundException);
    });

    it('never stores junk as an override', async () => {
      await expect(
        service.setGamePlatforms('user-1', game.id, ['ps5']),
      ).resolves.toEqual(['pc']);
      expect(repo.update).toHaveBeenCalledWith(expect.anything(), {
        platforms: ['pc'],
      });
    });
  });

  describe('who gets told about a drop', () => {
    const watcher = (
      userId: string,
      account: unknown,
      own: unknown = null,
    ) => ({
      userId,
      gameId: game.id,
      platforms: own,
      user: { id: userId, trackedPlatforms: account },
    });

    it('tells the people who own that machine', async () => {
      repo.find.mockResolvedValue([
        watcher('pc-person', ['pc']),
        watcher('ps-person', ['playstation']),
        watcher('both', ['pc', 'playstation']),
      ]);

      await expect(service.watchersOf(game.id, 'playstation')).resolves.toEqual(
        ['ps-person', 'both'],
      );
    });

    it('does not tell a PC-only person the PS5 price fell', async () => {
      // Same mistake as showing them the price, one step later — and this one
      // arrives as a push notification they did not ask for.
      repo.find.mockResolvedValue([watcher('pc-person', ['pc'])]);
      await expect(service.watchersOf(game.id, 'playstation')).resolves.toEqual(
        [],
      );
    });

    it('honours a per-game override over the account', async () => {
      repo.find.mockResolvedValue([
        watcher('pc-account-but-switch-for-this', ['pc'], ['nintendo']),
      ]);

      await expect(service.watchersOf(game.id, 'nintendo')).resolves.toEqual([
        'pc-account-but-switch-for-this',
      ]);
      await expect(service.watchersOf(game.id, 'pc')).resolves.toEqual([]);
    });

    it('treats a drop with no platform as PC', async () => {
      repo.find.mockResolvedValue([
        watcher('pc-person', ['pc']),
        watcher('ps-person', ['playstation']),
      ]);
      await expect(service.watchersOf(game.id, null)).resolves.toEqual([
        'pc-person',
      ]);
    });

    it('only considers watchers who are actually tracking', async () => {
      await service.watchersOf(game.id, 'pc');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { gameId: game.id, tracked: true },
        }),
      );
    });
  });

  it('only ever deletes your own row', async () => {
    await service.remove('user-1', 'game-9');
    expect(repo.delete).toHaveBeenCalledWith({
      userId: 'user-1',
      gameId: 'game-9',
    });
  });
});
