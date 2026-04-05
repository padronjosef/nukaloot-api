import { Injectable, Logger } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';
import { GameScraper, ScrapedPrice } from '../interfaces/scraper.interface';

@Injectable()
export class CDKeysScraper implements GameScraper {
  readonly storeName = 'CDKeys';
  private readonly logger = new Logger(CDKeysScraper.name);
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

      // CDKeys may have redirected to loaded.com — try loading and gracefully
      // return empty results if the site is unreachable or changed.
      const response = await page.goto(
        `https://www.cdkeys.com/catalogsearch/result/?q=${encodeURIComponent(query)}`,
        { waitUntil: 'domcontentloaded', timeout: 30000 },
      ).catch(() => null);

      if (!response || response.status() >= 400) {
        this.logger.warn('CDKeys appears unreachable or returned an error');
        await context.close();
        return [];
      }

      await page.waitForTimeout(3000);
      await page
        .waitForSelector('.product-item, .product-item-info', {
          timeout: 10000,
        })
        .catch(() => {});

      const items = await page.evaluate(() => {
        const results: {
          title: string;
          url: string;
          price: string;
          image: string;
        }[] = [];

        document
          .querySelectorAll('.product-item, .product-item-info, li.item.product')
          .forEach((el) => {
            const link = el.querySelector('a.product-item-link, a.product-item-photo') as HTMLAnchorElement;
            const titleEl = el.querySelector('.product-item-link, .product-name');
            const priceEl = el.querySelector('.price, .special-price .price, [data-price-amount]');
            const imgEl = el.querySelector('img') as HTMLImageElement;

            if (!link || !priceEl) return;

            const title = titleEl?.textContent?.trim() || '';
            const url = link.getAttribute('href') || '';

            if (!title) return;

            results.push({
              title,
              url,
              price: priceEl.textContent?.trim() || '',
              image: imgEl?.getAttribute('src') || '',
            });
          });

        return results;
      });

      await context.close();

      return items
        .filter((item) => item.price && item.title)
        .slice(0, 60)
        .map((item) => {
          const priceMatch = item.price.match(/([\d.,]+)/);
          const price = priceMatch
            ? parseFloat(priceMatch[1].replace(',', '.'))
            : 0;

          return {
            storeName: this.storeName,
            storeUrl: 'https://www.cdkeys.com',
            gameName: item.title,
            price,
            originalPrice: undefined,
            currency: 'EUR',
            productUrl: item.url.startsWith('http')
              ? item.url
              : `https://www.cdkeys.com${item.url}`,
            gameType: 'other' as const,
            imageUrl: item.image || '',
            backgroundUrl: '',
            releaseDate: '',
          };
        });
    } catch (error: unknown) {
      this.logger.error(
        `CDKeys search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
}
