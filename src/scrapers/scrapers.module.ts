import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScrapersService } from './scrapers.service';
import { SteamScraper } from './providers/steam.scraper';
import { CheapSharkScraper } from './providers/cheapshark.scraper';
import { InstantGamingScraper } from './providers/instantgaming.scraper';
import { EnebaScraper } from './providers/eneba.scraper';
import { G2AScraper } from './providers/g2a.scraper';
import { LoadedScraper } from './providers/loaded.scraper';
import { KinguinScraper } from './providers/kinguin.scraper';

@Module({
  imports: [HttpModule],
  providers: [
    ScrapersService,
    SteamScraper,
    CheapSharkScraper,
    InstantGamingScraper,
    EnebaScraper,
    G2AScraper,
    LoadedScraper,
    KinguinScraper,
  ],
  exports: [ScrapersService],
})
export class ScrapersModule {}
