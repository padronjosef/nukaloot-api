import { PLATFORMS, toPlatform } from '../scrapers/platform';
import type { Platform } from '../scrapers/platform';

/**
 * What somebody gets before they choose anything. PC is what this catalogue
 * has always sold, and a console key shown unasked is how a person buys a key
 * for a machine they do not own — which is not refundable.
 */
export const DEFAULT_PLATFORMS: readonly Platform[] = ['pc'];

/**
 * Cleans a stored or submitted preference into something safe to filter with.
 *
 * Unknown entries are dropped rather than coerced: `toPlatform` turns junk into
 * 'pc' when reading a *price*, because a price has to end up somewhere, but a
 * *preference* saying 'ps5' must not silently become "show me PC". An empty
 * result falls back to the default, never to "everything" — the failure mode of
 * an empty filter has to be showing too little, not too much.
 */
export const normalisePlatforms = (raw: unknown): Platform[] => {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<Platform>();

  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const value = entry.trim().toLowerCase();
    if (PLATFORMS.includes(value as Platform)) seen.add(value as Platform);
  }

  return seen.size > 0 ? [...seen] : [...DEFAULT_PLATFORMS];
};

/**
 * Which platforms apply to one saved game: its own choice when it has one,
 * otherwise the account's. A stored empty list is treated as "not set" — it
 * would otherwise hide the game's price with no way to tell why.
 */
export const effectivePlatforms = (
  perGame: unknown,
  accountWide: unknown,
): Platform[] => {
  const own = Array.isArray(perGame) && perGame.length > 0 ? perGame : null;
  return normalisePlatforms(own ?? accountWide);
};

/** Whether a price is for a machine the person actually has. */
export const priceIsWanted = (
  pricePlatform: unknown,
  wanted: readonly Platform[],
): boolean => wanted.includes(toPlatform(pricePlatform));
