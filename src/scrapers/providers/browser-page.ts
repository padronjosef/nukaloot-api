import type { BrowserContext, Page } from 'playwright';

/**
 * Images, video, fonts and stylesheets are the bulk of a storefront's weight
 * and none of it is read here — every field comes out of the DOM, and an
 * aborted image request still leaves its `src` attribute behind.
 *
 * Dropping them is what stops the renderer being killed under the container's
 * memory limit, which is what "Target crashed" was.
 */
const DEAD_WEIGHT = new Set(['image', 'media', 'font', 'stylesheet']);

export const blockHeavyRequests = async (context: BrowserContext) => {
  await context.route('**/*', (route) => {
    if (DEAD_WEIGHT.has(route.request().resourceType())) {
      void route.abort();
      return;
    }
    void route.continue();
  });
};

/** A renderer that died, as opposed to a site that simply said no. */
export const isCrash = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  // "crashed" covers Playwright's "Target crashed"; "Target closed" is the
  // same accident seen a moment later, once the page has gone with it.
  return message.includes('crashed') || message.includes('Target closed');
};

/**
 * Runs the scrape, and runs it once more if the renderer died. A crash is a
 * resource accident rather than an answer, so retrying is honest; anything
 * else is the site talking and gets reported as it is.
 */
export const withCrashRetry = async <T>(
  attempt: () => Promise<T>,
  onCrash: () => Promise<void> | void,
): Promise<T> => {
  try {
    return await attempt();
  } catch (error) {
    if (!isCrash(error)) throw error;
    await onCrash();
    return attempt();
  }
};

export const closeQuietly = async (page: Page | null) => {
  await page
    ?.context()
    .close()
    .catch(() => {});
};
