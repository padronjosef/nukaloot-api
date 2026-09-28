import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { SearchLog, User } from '../entities';
import { GeoService } from './geo.service';

export type ClientMeta = {
  ip: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  userAgent: string | null;
  referer: string | null;
  userId: string | null;
};

export type RecordSearchInput = {
  query: string;
  currencyRegion?: string | null;
  cacheHit?: boolean;
  resultCount?: number;
  client: ClientMeta;
};

export type Range = '24h' | '7d' | '30d' | 'all';

/**
 * The three kinds of traffic, told apart by what is knowable: a bot names
 * itself in its user agent, and a person either had a session or did not.
 */
export type VisitorKind = 'bots' | 'registered' | 'anonymous';
export type TimelineValue = { count: number; visitors: number };

const BOT_PATTERN =
  /bot|crawler|spider|crawling|slurp|bingpreview|headlesschrome|python-requests|curl\/|wget|go-http-client|axios\/|node-fetch|scrapy|facebookexternalhit|whatsapp|telegrambot|semrush|ahrefs|mj12|dotbot|petalbot|yandex|duckduckbot|applebot|gptbot|claudebot|perplexity/i;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(SearchLog)
    private readonly repo: Repository<SearchLog>,
    private readonly geo: GeoService,
  ) {}

  /**
   * Never let analytics break a search: everything here is best effort and
   * swallows its own failures.
   */
  async recordSearch(input: RecordSearchInput): Promise<void> {
    try {
      const { client } = input;
      let { country, city, region } = client;

      if (!country) {
        const geo = await this.geo.lookup(client.ip);
        country = geo.country;
        city = city || geo.city;
        region = region || geo.region;
      }

      await this.repo.save(
        this.repo.create({
          query: input.query.slice(0, 200),
          normalizedQuery: this.normalize(input.query),
          ip: client.ip?.slice(0, 45) || null,
          country: country?.slice(0, 2).toUpperCase() || null,
          city: city || null,
          region: region || null,
          currencyRegion: input.currencyRegion?.slice(0, 8) || null,
          userAgent: client.userAgent || null,
          referer: client.referer || null,
          isBot: BOT_PATTERN.test(client.userAgent || ''),
          cacheHit: input.cacheHit ?? false,
          resultCount: input.resultCount ?? 0,
          visitorId: this.visitorId(client.ip, client.userAgent),
          userId: client.userId ?? null,
        }),
      );
    } catch (err) {
      this.logger.warn(`Failed to record search: ${String(err)}`);
    }
  }

  async getOverview(range: Range, includeBots: boolean) {
    const qb = this.base(range, includeBots)
      .select('COUNT(*)', 'searches')
      .addSelect('COUNT(DISTINCT log.visitorId)', 'visitors')
      .addSelect('COUNT(DISTINCT log.ip)', 'ips')
      .addSelect('COUNT(DISTINCT log.normalizedQuery)', 'uniqueQueries')
      .addSelect('COUNT(DISTINCT log.country)', 'countries')
      .addSelect('COUNT(DISTINCT log.userId)', 'signedInUsers')
      .addSelect(
        'COUNT(*) FILTER (WHERE log.userId IS NOT NULL)',
        'signedInSearches',
      )
      .addSelect('COUNT(*) FILTER (WHERE log.cacheHit = true)', 'cacheHits');

    // Counted over the whole range on purpose: with bots excluded the filtered
    // set holds none of them, and a tile that always reads zero says nothing.
    const [row, botSearches] = await Promise.all([
      qb.getRawOne<Record<string, string>>(),
      this.base(range, true).andWhere('log.isBot = true').getCount(),
    ]);

    const searches = Number(row?.searches ?? 0);
    const cacheHits = Number(row?.cacheHits ?? 0);

    return {
      searches,
      visitors: Number(row?.visitors ?? 0),
      ips: Number(row?.ips ?? 0),
      uniqueQueries: Number(row?.uniqueQueries ?? 0),
      countries: Number(row?.countries ?? 0),
      signedInUsers: Number(row?.signedInUsers ?? 0),
      signedInSearches: Number(row?.signedInSearches ?? 0),
      cacheHits,
      cacheHitRate: searches ? cacheHits / searches : 0,
      botSearches,
    };
  }

  async getTopQueries(range: Range, includeBots: boolean, limit = 25) {
    const rows = await this.base(range, includeBots)
      .select('log.normalizedQuery', 'query')
      .addSelect('MAX(log.query)', 'sample')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COUNT(DISTINCT log.visitorId)', 'visitors')
      .addSelect('MAX(log.createdAt)', 'lastSearchedAt')
      .groupBy('log.normalizedQuery')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('MAX(log.createdAt)', 'DESC')
      .limit(limit)
      .getRawMany<Record<string, string>>();

    return rows.map((r) => ({
      query: r.sample,
      normalizedQuery: r.query,
      count: Number(r.count),
      visitors: Number(r.visitors),
      lastSearchedAt: r.lastSearchedAt,
    }));
  }

  async getByCountry(range: Range, includeBots: boolean) {
    const rows = await this.base(range, includeBots)
      .select('log.country', 'country')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COUNT(DISTINCT log.visitorId)', 'visitors')
      .groupBy('log.country')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany<Record<string, string>>();

    return rows.map((r) => ({
      country: r.country || null,
      count: Number(r.count),
      visitors: Number(r.visitors),
    }));
  }

  /**
   * Takes no bot filter on purpose: the chart splits traffic into its three
   * kinds and lets the caller decide which lines to draw.
   */
  async getTimeline(range: Range) {
    const unit = range === '24h' ? 'hour' : 'day';
    // Always all three groups, whatever the bot filter says: the chart draws
    // bots as their own line rather than folding them into the total.
    const rows = await this.base(range, true)
      .select(`date_trunc('${unit}', log.createdAt)`, 'bucket')
      .addSelect(
        `CASE
           WHEN log.isBot THEN 'bots'
           WHEN log.userId IS NOT NULL THEN 'registered'
           ELSE 'anonymous'
         END`,
        'kind',
      )
      .addSelect('COUNT(*)', 'count')
      .addSelect('COUNT(DISTINCT log.visitorId)', 'visitors')
      .groupBy('bucket')
      .addGroupBy('kind')
      .orderBy('bucket', 'ASC')
      .getRawMany<{
        bucket: Date;
        kind: VisitorKind;
        count: string;
        visitors: string;
      }>();

    const found = new Map<
      number,
      Partial<Record<VisitorKind, TimelineValue>>
    >();
    for (const row of rows) {
      const time = new Date(row.bucket).getTime();
      const slot = found.get(time) ?? {};
      slot[row.kind] = {
        count: Number(row.count),
        visitors: Number(row.visitors),
      };
      found.set(time, slot);
    }

    const empty = (): TimelineValue => ({ count: 0, visitors: 0 });

    // Every slot in the range, not only the ones with searches. Without this a
    // quiet week and a busy day draw the same single point, and switching from
    // 7d to 30d changes nothing on screen.
    return this.bucketsFor(range, unit, [...found.keys()]).map((time) => {
      const slot = found.get(time) ?? {};
      return {
        bucket: new Date(time).toISOString(),
        registered: slot.registered ?? empty(),
        anonymous: slot.anonymous ?? empty(),
        bots: slot.bots ?? empty(),
      };
    });
  }

  /** The timestamps the range covers, truncated the same way the query is. */
  private bucketsFor(
    range: Range,
    unit: 'hour' | 'day',
    present: number[],
  ): number[] {
    const step = unit === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

    const truncate = (date: Date): Date => {
      const copy = new Date(date);
      copy.setMinutes(0, 0, 0);
      if (unit === 'day') copy.setHours(0, 0, 0, 0);
      return copy;
    };

    const end = truncate(new Date()).getTime();
    const counts: Record<Range, number> = {
      '24h': 24,
      '7d': 7,
      '30d': 30,
      all: 0,
    };

    // "All time" has no fixed width, so it runs from the first search there
    // has ever been — capped, because a year of daily bars is unreadable.
    const start =
      range === 'all'
        ? present.length
          ? Math.max(Math.min(...present), end - 179 * step)
          : end
        : end - (counts[range] - 1) * step;

    const buckets: number[] = [];
    for (let time = start; time <= end; time += step) buckets.push(time);
    return buckets;
  }

  /**
   * Joined rather than copied onto the row: the email shown is always the
   * current one, and deleting an account leaves the search in place.
   */
  async getRecent(range: Range, includeBots: boolean, limit = 100) {
    const rows = await this.base(range, includeBots)
      .leftJoin(User, 'u', 'u.id = log.userId')
      .select('log')
      .addSelect('u.email', 'user_email')
      .addSelect('u.name', 'user_name')
      .orderBy('log.createdAt', 'DESC')
      .limit(limit)
      .getRawAndEntities();

    return rows.entities.map((log, index) => ({
      ...log,
      userEmail: (rows.raw[index] as Record<string, string | null>).user_email,
      userName: (rows.raw[index] as Record<string, string | null>).user_name,
    }));
  }

  async getTopVisitors(range: Range, includeBots: boolean, limit = 15) {
    const rows = await this.base(range, includeBots)
      .select('log.visitorId', 'visitorId')
      .addSelect('MAX(log.ip)', 'ip')
      .addSelect('MAX(log.country)', 'country')
      .addSelect('MAX(log.city)', 'city')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MAX(log.createdAt)', 'lastSeenAt')
      .addSelect('MAX(log.userAgent)', 'userAgent')
      // Who they signed in as, when they ever did. The IP stays either way:
      // the two answer different questions.
      .addSelect('MAX(u.email)', 'userEmail')
      .addSelect('MAX(u.name)', 'userName')
      .leftJoin(User, 'u', 'u.id = log.userId')
      // andWhere, not where: where() would replace the range and bot filters.
      .andWhere('log.visitorId IS NOT NULL')
      .groupBy('log.visitorId')
      .orderBy('COUNT(*)', 'DESC')
      .limit(limit)
      .getRawMany<Record<string, string>>();

    return rows.map((r) => ({
      visitorId: r.visitorId,
      ip: r.ip,
      country: r.country,
      city: r.city,
      count: Number(r.count),
      lastSeenAt: r.lastSeenAt,
      userAgent: r.userAgent,
      userEmail: r.userEmail ?? null,
      userName: r.userName ?? null,
    }));
  }

  private base(range: Range, includeBots: boolean) {
    const qb = this.repo.createQueryBuilder('log');
    const since = this.since(range);

    if (since) qb.andWhere('log.createdAt >= :since', { since });
    if (!includeBots) qb.andWhere('log.isBot = false');

    return qb;
  }

  private since(range: Range): Date | null {
    const hours: Record<Range, number | null> = {
      '24h': 24,
      '7d': 24 * 7,
      '30d': 24 * 30,
      all: null,
    };
    const window = hours[range];
    if (!window) return null;
    return new Date(Date.now() - window * 60 * 60 * 1000);
  }

  private normalize(query: string): string {
    return query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  }

  private visitorId(
    ip: string | null,
    userAgent: string | null,
  ): string | null {
    if (!ip) return null;
    const salt = process.env.ANALYTICS_VISITOR_SALT || 'nukaloot';
    return createHash('sha256')
      .update(`${salt}:${ip}:${userAgent || ''}`)
      .digest('hex')
      .slice(0, 32);
  }
}
