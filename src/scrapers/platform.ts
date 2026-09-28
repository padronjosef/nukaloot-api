export const PLATFORMS = ['pc', 'playstation', 'xbox', 'nintendo'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** What a listing turned out to be once its title and URL were read. */
export type Listing = 'pc' | 'console' | 'ambiguous';

/**
 * Reads a stored platform value. Anything unrecognised — a row saved before
 * the column existed, a value written by hand — is PC, which is what silence
 * has always meant here. The web has the same function for the same reason;
 * the two must agree or a price shown in the results would be filtered out of
 * the favourites list, or worse, the other way round.
 */
export const toPlatform = (value: unknown): Platform =>
  PLATFORMS.includes(value as Platform) ? (value as Platform) : 'pc';

const CONSOLE_SIGNATURES: [RegExp, Platform][] = [
  [/\bplay ?station\b|\bpsn\b|\bps ?[345]\b/i, 'playstation'],
  [/\bxbox\b|\bx ?box\b|\bgame ?pass\b/i, 'xbox'],
  [/\bnintendo\b|\bswitch\b|\bwii\b|\b3ds\b/i, 'nintendo'],
];

const PC_SIGNATURE =
  /\bsteam\b|\bpc\b|\bwindows\b|\bepic\b|\bgog\b|\buplay\b|\bubisoft\b|\borigin\b|\bea app\b|\bbattle\.?net\b|\brockstar\b/i;

/**
 * Whether a listing is safe to show in a PC catalogue.
 *
 * Most titles say nothing about the machine — "Elden Ring" is just "Elden
 * Ring" — so silence means PC here, which is what this catalogue sells.
 * What must never pass is a title naming a console, and in particular one
 * naming a console *and* PC, like "EA FC 25 PS5 & PC": that is ambiguous, not
 * PC, and treating it as PC is how somebody buys a key their machine cannot
 * use and cannot refund.
 */
export const classifyListing = (...text: (string | undefined)[]): Listing => {
  const haystack = text.filter(Boolean).join(' ');

  const console = CONSOLE_SIGNATURES.some(([pattern]) =>
    pattern.test(haystack),
  );
  if (!console) return 'pc';

  return PC_SIGNATURE.test(haystack) ? 'ambiguous' : 'console';
};

/** Which console a listing names. Only meaningful once it is not PC. */
export const detectPlatform = (...text: (string | undefined)[]): Platform => {
  const haystack = text.filter(Boolean).join(' ');

  return (
    CONSOLE_SIGNATURES.find(([pattern]) => pattern.test(haystack))?.[1] ?? 'pc'
  );
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  pc: 'PC',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  nintendo: 'Nintendo',
};
