import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query('q') query: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException(
        'Query parameter "q" is required (min 2 characters)',
      );
    }

    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(
      50,
      Math.max(1, parseInt(limit || '12', 10) || 12),
    );

    return this.searchService.search(query.trim(), pageNum, limitNum);
  }

  @Get('stream')
  async stream(
    @Query('q') query: string,
    @Query('cc') cc: string,
    @Res() res: Response,
  ) {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException(
        'Query parameter "q" is required (min 2 characters)',
      );
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Fast results first (may come from cache)
    const region = cc || 'us';
    const { game, prices, steamIndex, errors } =
      await this.searchService.searchFast(query.trim(), region);

    if (!steamIndex) {
      // Cache hit — send prices + saved failed stores
      res.write(`data: ${JSON.stringify({ type: 'fast', game, prices })}\n\n`);
      if (game.failedStores?.length > 0) {
        for (const err of game.failedStores) {
          res.write(
            `data: ${JSON.stringify({ type: 'scraper-error', store: err.store, reason: err.reason })}\n\n`,
          );
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
      return;
    }

    // No Steam results — skip slow scrapers since we have no reference data
    if (steamIndex.map.size === 0 && prices.length === 0) {
      res.write(`data: ${JSON.stringify({ type: 'fast', game, prices: [] })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
      return;
    }

    // Cache miss — scrape slow sources too
    const allErrors: { store: string; reason: string }[] = [...(errors || [])];

    res.write(
      `data: ${JSON.stringify({ type: 'pending', scrapers: ['Instant Gaming', 'Eneba', 'G2A', 'CDKeys', 'Kinguin'] })}\n\n`,
    );
    res.write(`data: ${JSON.stringify({ type: 'fast', game, prices })}\n\n`);

    // Emit fast-phase errors
    for (const err of allErrors) {
      res.write(
        `data: ${JSON.stringify({ type: 'scraper-error', store: err.store, reason: err.reason })}\n\n`,
      );
    }

    for await (const event of this.searchService.searchSlow(
      query.trim(),
      steamIndex,
    )) {
      if (event.type === 'results') {
        const withTimestamp = event.prices.map((p) => ({
          ...p,
          scrapedAt: new Date().toISOString(),
        }));
        // Save slow results to DB
        await this.searchService.savePrices(game, event.prices);
        res.write(
          `data: ${JSON.stringify({ type: 'slow', prices: withTimestamp })}\n\n`,
        );
      } else if (event.type === 'scraping-start') {
        res.write(
          `data: ${JSON.stringify({ type: 'scraping-store', store: event.store, status: 'start' })}\n\n`,
        );
      } else if (event.type === 'scraping-end') {
        res.write(
          `data: ${JSON.stringify({ type: 'scraping-store', store: event.store, status: 'end' })}\n\n`,
        );
      } else if (event.type === 'error') {
        allErrors.push({ store: event.store, reason: event.reason });
        res.write(
          `data: ${JSON.stringify({ type: 'scraper-error', store: event.store, reason: event.reason })}\n\n`,
        );
      }
    }

    // Save failed stores to DB
    await this.searchService.saveFailedStores(game.id, allErrors);

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  }
}
