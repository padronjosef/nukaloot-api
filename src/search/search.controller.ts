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
    const { game, prices, steamIndex } = await this.searchService.searchFast(
      query.trim(),
      region,
    );

    if (!steamIndex) {
      // Cache hit — send everything and finish
      res.write(`data: ${JSON.stringify({ type: 'fast', game, prices })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
      return;
    }

    // Cache miss — scrape slow sources too
    res.write(
      `data: ${JSON.stringify({ type: 'pending', scrapers: ['Instant Gaming'] })}\n\n`,
    );
    res.write(`data: ${JSON.stringify({ type: 'fast', game, prices })}\n\n`);

    for await (const results of this.searchService.searchSlow(
      query.trim(),
      steamIndex,
    )) {
      res.write(
        `data: ${JSON.stringify({ type: 'slow', prices: results })}\n\n`,
      );
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  }
}
