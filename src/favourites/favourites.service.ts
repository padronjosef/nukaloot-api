import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favourite, Game, Price, User } from '../entities';
import type { FavouriteSource } from '../entities';
import { toPlatform } from '../scrapers/platform';
import { matchesQuery } from '../scrapers/relevance';
import type { Platform } from '../scrapers/platform';
import { GamesService } from '../games/games.service';
import {
  effectivePlatforms,
  normalisePlatforms,
  priceIsWanted,
} from './platform-preference';

const DEFAULT_LIMIT = 100;

export type FavouriteView = {
  gameId: string;
  name: string;
  slug: string;
  coverUrl: string | null;
  addedAt: Date;
  source: FavouriteSource;
  tracked: boolean;
  priceWhenAdded: number | null;
  /** Cheapest price we already hold. Null when nothing has been scraped yet. */
  bestPrice: number | null;
  currency: string | null;
  storeName: string | null;
  productUrl: string | null;
  /** When that price was read, so the page can say how stale it is. */
  scrapedAt: Date | null;
  /** Which machine that price is for, so the page can never imply the wrong one. */
  platform: Platform | null;
  /** The platforms this game is priced on, and whether the game overrides the account. */
  platforms: Platform[];
  platformsAreOwn: boolean;
};

@Injectable()
export class FavouritesService {
  constructor(
    @InjectRepository(Favourite)
    private readonly repo: Repository<Favourite>,
    @InjectRepository(Price)
    private readonly prices: Repository<Price>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly games: GamesService,
  ) {}

  get limit(): number {
    const raw = Number(process.env.FAVOURITES_PER_USER);
    return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_LIMIT;
  }

  /** Only the tracked ones count: storing a game costs nothing to watch. */
  async countTracked(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, tracked: true } });
  }

  /** The account-wide setting, cleaned. Never empty, never unknown. */
  async platformsFor(userId: string): Promise<Platform[]> {
    const user = await this.users.findOne({ where: { id: userId } });
    return normalisePlatforms(user?.trackedPlatforms);
  }

  /**
   * The list with the cheapest price already on hand. Reading the cache
   * rather than scraping keeps opening the page instant; the tracker is what
   * keeps those numbers fresh.
   */
  async listFor(userId: string): Promise<FavouriteView[]> {
    const rows = await this.repo.find({
      where: { userId },
      relations: { game: true },
      order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) return [];

    const accountWide = await this.platformsFor(userId);
    const wanted = new Map<string, Platform[]>(
      rows.map((row) => [
        row.gameId,
        effectivePlatforms(row.platforms, accountWide),
      ]),
    );

    const cheapest = await this.cheapestByGame(wanted);

    return rows.map((row) => {
      const best = cheapest.get(row.gameId);
      const platforms = wanted.get(row.gameId) ?? accountWide;
      return {
        gameId: row.gameId,
        name: row.game.name,
        slug: row.game.slug,
        coverUrl: row.game.coverUrl || null,
        addedAt: row.createdAt,
        source: row.source,
        tracked: row.tracked,
        priceWhenAdded: row.priceWhenAdded,
        bestPrice: best ? Number(best.price) : null,
        currency: best?.currency ?? null,
        storeName: best?.storeName ?? null,
        productUrl: best?.productUrl ?? null,
        scrapedAt: best?.scrapedAt ?? null,
        platform: best ? best.wantedAs : null,
        platforms,
        platformsAreOwn:
          Array.isArray(row.platforms) && row.platforms.length > 0,
      };
    });
  }

  /** Saving by name, because that is all the carousels and results know. */
  async add(userId: string, gameName: string): Promise<FavouriteView> {
    const game = await this.games.findOrCreate(gameName);
    const existing = await this.repo.findOne({
      where: { userId, gameId: game.id },
    });

    // The limit is checked only when something is actually being added.
    // Saving a game already on the list changes nothing, so refusing it would
    // be a dead end: the heart looks broken and there is nothing to remove.
    if (!existing) {
      const tracked = await this.countTracked(userId);
      if (tracked >= this.limit) {
        throw new BadRequestException(
          `You can track ${this.limit} games at once. Untrack one to add another.`,
        );
      }

      // A brand new row follows the account, so "the price when you added it"
      // is the price on the machines they own — not a console one they will
      // later be told has dropped.
      const accountWide = await this.platformsFor(userId);
      const cheapest = await this.cheapestByGame(
        new Map([[game.id, accountWide]]),
      );
      const best = cheapest.get(game.id);

      await this.repo.save(
        this.repo.create({
          userId,
          gameId: game.id,
          priceWhenAdded: best ? Number(best.price) : null,
        }),
      );
    }

    const list = await this.listFor(userId);
    const view = list.find((item) => item.gameId === game.id);
    if (!view) throw new NotFoundException('Could not save that game');
    return view;
  }

  async remove(userId: string, gameId: string): Promise<void> {
    await this.repo.delete({ userId, gameId });
  }

  /** Sets the account-wide platforms. Returns what was actually stored. */
  async setPlatforms(userId: string, platforms: unknown): Promise<Platform[]> {
    const next = normalisePlatforms(platforms);
    const result = await this.users.update(
      { id: userId },
      {
        trackedPlatforms: next,
      },
    );
    if (result.affected === 0) throw new NotFoundException('No such account');
    return next;
  }

  /**
   * Sets the platforms for one saved game. Passing null clears the override so
   * the game follows the account again.
   */
  async setGamePlatforms(
    userId: string,
    gameId: string,
    platforms: unknown,
  ): Promise<Platform[]> {
    const next = platforms === null ? null : normalisePlatforms(platforms);
    const result = await this.repo.update(
      { userId, gameId },
      {
        platforms: next,
      },
    );
    if (result.affected === 0) {
      throw new NotFoundException('That game is not on your list');
    }
    return next ?? (await this.platformsFor(userId));
  }

  /**
   * Which games anybody is watching. The tracker's whole input: a thousand
   * people on one game collapse into a single row here.
   */
  async trackedGameIds(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('f')
      .select('DISTINCT f.gameId', 'gameId')
      .where('f.tracked = true')
      .getRawMany<{ gameId: string }>();

    return rows.map((r) => r.gameId);
  }

  /**
   * Everybody watching a game *on the platform the drop happened on*, for
   * fanning a price drop out to them. Telling a PC-only person that the PS5
   * price fell is the same mistake as showing them that price, one step later.
   */
  async watchersOf(gameId: string, platform: unknown): Promise<string[]> {
    const rows = await this.repo.find({
      where: { gameId, tracked: true },
      relations: { user: true },
    });

    return rows
      .filter((row) =>
        priceIsWanted(
          platform,
          effectivePlatforms(
            row.platforms,
            normalisePlatforms(row.user?.trackedPlatforms),
          ),
        ),
      )
      .map((row) => row.userId);
  }

  /**
   * The cheapest price per game *among the platforms wanted for that game*.
   *
   * A game whose only listings are for machines the person does not own gets
   * no price at all. That is deliberate: no price is a blank on the page, a
   * wrong-platform price is a key somebody buys and cannot refund.
   */
  private async cheapestByGame(
    wanted: Map<string, readonly Platform[]>,
  ): Promise<Map<string, Price & { storeName: string; wantedAs: Platform }>> {
    const gameIds = [...wanted.keys()];
    if (gameIds.length === 0) return new Map();

    // One query for the whole page rather than one per game. The game is
    // selected, not just joined, because the row has to be grouped by it.
    const rows = await this.prices
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.store', 'store')
      .leftJoinAndSelect('p.game', 'game')
      .where('game.id IN (:...gameIds)', { gameIds })
      .orderBy('game.id')
      .addOrderBy('p.price', 'ASC')
      .getMany();

    // Ordered cheapest first, so the first *wanted* row seen for a game wins.
    const cheapest = new Map<
      string,
      Price & { storeName: string; wantedAs: Platform }
    >();
    for (const price of rows) {
      const gameId = (price as Price & { game?: Game }).game?.id;
      if (!gameId || cheapest.has(gameId)) continue;

      const allowed = wanted.get(gameId);
      // A game nobody asked about, or a price for the wrong machine.
      if (!allowed || !priceIsWanted(price.platform, allowed)) continue;

      // Prices are attached to the game whose search saved them, and searches
      // used to save whatever the store recommended. A listing for a
      // different game entirely must not become this one's best price.
      const gameName = (price as Price & { game?: Game }).game?.name;
      if (gameName && !matchesQuery(gameName, price.gameName)) continue;

      cheapest.set(gameId, {
        ...price,
        storeName: price.store?.name ?? '',
        wantedAs: toPlatform(price.platform),
      } as Price & { storeName: string; wantedAs: Platform });
    }

    return cheapest;
  }
}
