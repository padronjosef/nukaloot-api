import type { BrowserContext, Route } from 'playwright';
import { blockHeavyRequests, isCrash, withCrashRetry } from './browser-page';

/**
 * Loaded was returning nothing at all — "Target crashed" on every search —
 * because the renderer was being killed under the container's memory limit
 * while loading storefront artwork nobody reads. These guard the two halves
 * of that fix: not fetching the weight, and telling a crash apart from a
 * site that simply said no.
 */
const fakeContext = () => {
  const routes: { url: string; handler: (route: Route) => void }[] = [];
  const context = {
    route: (url: string, handler: (route: Route) => void) => {
      routes.push({ url, handler });
      return Promise.resolve();
    },
  } as unknown as BrowserContext;

  const send = (resourceType: string) => {
    const calls = { aborted: false, continued: false };
    const route = {
      request: () => ({ resourceType: () => resourceType }),
      abort: () => {
        calls.aborted = true;
        return Promise.resolve();
      },
      continue: () => {
        calls.continued = true;
        return Promise.resolve();
      },
    } as unknown as Route;

    routes[0].handler(route);
    return calls;
  };

  return { context, send, routes };
};

describe('blockHeavyRequests', () => {
  it.each(['image', 'media', 'font', 'stylesheet'])(
    'drops %s, which is weight nothing here reads',
    async (type) => {
      const { context, send } = fakeContext();
      await blockHeavyRequests(context);

      expect(send(type).aborted).toBe(true);
    },
  );

  it.each(['document', 'xhr', 'fetch', 'script'])(
    'lets %s through, because the page is the answer',
    async (type) => {
      // Blocking the document or its scripts would leave an empty DOM and
      // look exactly like a store with no stock.
      const { context, send } = fakeContext();
      await blockHeavyRequests(context);

      const calls = send(type);
      expect(calls.continued).toBe(true);
      expect(calls.aborted).toBe(false);
    },
  );

  it('intercepts every request, not a subset', async () => {
    const { context, routes } = fakeContext();
    await blockHeavyRequests(context);

    expect(routes).toHaveLength(1);
    expect(routes[0].url).toBe('**/*');
  });
});

describe('isCrash', () => {
  it.each(['Target crashed', 'page.evaluate: Target crashed', 'Target closed'])(
    'recognises %s',
    (message) => {
      expect(isCrash(new Error(message))).toBe(true);
    },
  );

  describe('what it must not call a crash', () => {
    it.each([
      'Timeout 30000ms exceeded',
      'net::ERR_CONNECTION_REFUSED',
      'Navigation failed because the page was reloaded',
      'HTTP 403',
    ])('leaves %s alone', (message) => {
      // Retrying these would double the load on a site that already said no,
      // and hide a real outage behind a second identical failure.
      expect(isCrash(new Error(message))).toBe(false);
    });

    it('survives something that is not an Error at all', () => {
      expect(isCrash('Target crashed')).toBe(true);
      expect(isCrash(undefined)).toBe(false);
      expect(isCrash(null)).toBe(false);
    });
  });
});

describe('withCrashRetry', () => {
  it('does not retry what worked', async () => {
    const attempt = jest.fn().mockResolvedValue('ok');
    const onCrash = jest.fn();

    await expect(withCrashRetry(attempt, onCrash)).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onCrash).not.toHaveBeenCalled();
  });

  it('runs once more after a crash', async () => {
    const attempt = jest
      .fn()
      .mockRejectedValueOnce(new Error('Target crashed'))
      .mockResolvedValue('ok');
    const onCrash = jest.fn();

    await expect(withCrashRetry(attempt, onCrash)).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(onCrash).toHaveBeenCalledTimes(1);
  });

  it('gives up after the second crash rather than looping', async () => {
    // A site crashing every time is a real failure, and retrying forever
    // would hold the whole search open waiting for it.
    const attempt = jest.fn().mockRejectedValue(new Error('Target crashed'));

    await expect(withCrashRetry(attempt, jest.fn())).rejects.toThrow(
      'Target crashed',
    );
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('does not retry a refusal, and passes it up untouched', async () => {
    const attempt = jest.fn().mockRejectedValue(new Error('HTTP 403'));
    const onCrash = jest.fn();

    await expect(withCrashRetry(attempt, onCrash)).rejects.toThrow('HTTP 403');
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onCrash).not.toHaveBeenCalled();
  });
});
