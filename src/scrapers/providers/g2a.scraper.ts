import { Injectable, Logger } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';
import { GameScraper, ScrapedPrice } from '../interfaces/scraper.interface';

@Injectable()
export class G2AScraper implements GameScraper {
  readonly storeName = 'G2A';
  private readonly logger = new Logger(G2AScraper.name);
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
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      page = await context.newPage();

      // Intercept API responses from G2A's internal search
      const apiResults: ScrapedPrice[] = [];
      page.on('response', async (response) => {
        try {
          const url = response.url();
          if (
            url.includes('/lucene/search/') ||
            url.includes('/marketplace/product/') ||
            url.includes('/search/api')
          ) {
            const json = await response.json().catch(() => null);
            const items =
              json?.data?.items ||
              json?.data?.products ||
              json?.items ||
              json?.products ||
              [];
            for (const item of items) {
              const name = item.name || item.title || '';
              const price =
                item.minPrice || item.price || item.lowestPrice || 0;
              if (!name || !price) continue;
              apiResults.push({
                storeName: this.storeName,
                storeUrl: 'https://www.g2a.com',
                gameName: name,
                price:
                  typeof price === 'string'
                    ? parseFloat(price)
                    : price > 100
                      ? price / 100
                      : price,
                originalPrice: undefined,
                currency: 'EUR',
                productUrl: item.slug
                  ? `https://www.g2a.com${item.slug}`
                  : item.url || 'https://www.g2a.com',
                gameType: 'other',
                imageUrl: item.image || item.smallImage || '',
                backgroundUrl: '',
                releaseDate: '',
              });
            }
          }
        } catch {
          // Ignore parse errors
        }
      });

      await page.goto(
        `https://www.g2a.com/search?query=${encodeURIComponent(query)}`,
        { waitUntil: 'domcontentloaded', timeout: 30000 },
      );
      await page.waitForTimeout(5000);
      await context.close();

      if (apiResults.length > 0) {
        return apiResults.slice(0, 60);
      }

      return [];
    } catch (error: unknown) {
      this.logger.error(
        `G2A search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
}
