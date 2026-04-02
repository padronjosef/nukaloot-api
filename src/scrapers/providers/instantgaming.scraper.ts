import { Injectable, Logger } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';
import { GameScraper, ScrapedPrice } from '../interfaces/scraper.interface';

@Injectable()
export class InstantGamingScraper implements GameScraper {
  readonly storeName = 'Instant Gaming';
  private readonly logger = new Logger(InstantGamingScraper.name);
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
    }
    return this.browser;
  }

  async search(query: string): Promise<ScrapedPrice[]> {
    let page = null;
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      page = await context.newPage();

      await page.goto(
        `https://www.instant-gaming.com/en/search/?q=${encodeURIComponent(query)}`,
        { waitUntil: 'networkidle', timeout: 20000 },
      );

      const items = await page.evaluate(() => {
        const results: {
          title: string;
          url: string;
          price: string;
          discount: string;
          image: string;
        }[] = [];

        document
          .querySelectorAll('.search.listing-items .item')
          .forEach((el) => {
            const link = el.querySelector('a.cover') as HTMLAnchorElement;
            const priceEl = el.querySelector('.price');
            const discountEl = el.querySelector('.discount');
            const imgEl = el.querySelector('img') as HTMLImageElement;

            if (!link || !priceEl) return;

            results.push({
              title: link.getAttribute('title') || '',
              url: link.getAttribute('href') || '',
              price: priceEl.textContent?.trim() || '',
              discount: discountEl?.textContent?.trim() || '',
              image:
                imgEl?.getAttribute('data-src') ||
                imgEl?.dataset?.src ||
                imgEl?.getAttribute('src') ||
                '',
            });
          });

        return results;
      });

      await context.close();

      return items
        .filter((item) => item.price && item.title)
        .slice(0, 60)
        .map((item) => {
          // Parse price: "31.99 €" → 31.99
          const priceMatch = item.price.match(/([\d.,]+)/);
          const price = priceMatch
            ? parseFloat(priceMatch[1].replace(',', '.'))
            : 0;

          return {
            storeName: this.storeName,
            storeUrl: 'https://www.instant-gaming.com',
            gameName: item.title.replace(/\s*-\s*Latin America$/i, '').trim(),
            price,
            originalPrice: undefined,
            currency: 'EUR',
            productUrl: item.url.startsWith('http')
              ? item.url
              : `https://www.instant-gaming.com${item.url}`,
            gameType: 'unknown' as const,
            imageUrl:
              item.image && !item.image.includes('lazy.svg') ? item.image : '',
            backgroundUrl: '',
            releaseDate: '',
          };
        });
    } catch (error: unknown) {
      this.logger.error(
        `Instant Gaming search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
}
