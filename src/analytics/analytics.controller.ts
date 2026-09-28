import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService, Range } from './analytics.service';
import { BearerGuard } from '../auth/bearer.guard';

const RANGES: Range[] = ['24h', '7d', '30d', 'all'];

const parseRange = (value?: string): Range =>
  RANGES.includes(value as Range) ? (value as Range) : '7d';

@Controller('analytics')
@UseGuards(BearerGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  async summary(@Query('range') range?: string, @Query('bots') bots?: string) {
    const r = parseRange(range);
    const includeBots = bots === 'true';

    const [overview, topQueries, byCountry, timeline, topVisitors] =
      await Promise.all([
        this.analytics.getOverview(r, includeBots),
        this.analytics.getTopQueries(r, includeBots),
        this.analytics.getByCountry(r, includeBots),
        this.analytics.getTimeline(r),
        this.analytics.getTopVisitors(r, includeBots),
      ]);

    return {
      range: r,
      includeBots,
      overview,
      topQueries,
      byCountry,
      timeline,
      topVisitors,
    };
  }

  @Get('recent')
  recent(
    @Query('range') range?: string,
    @Query('bots') bots?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Math.min(
      500,
      Math.max(1, parseInt(limit || '100', 10) || 100),
    );
    return this.analytics.getRecent(parseRange(range), bots === 'true', parsed);
  }
}
