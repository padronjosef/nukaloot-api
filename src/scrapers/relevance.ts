/**
 * Whether a listing is actually the game somebody asked for.
 *
 * Store search endpoints answer with recommendations, not just matches:
 * searching Instant Gaming for "dark souls 3" comes back with Lies of P,
 * Nioh, Elden Ring and Death's Door. Those are fine suggestions and a terrible
 * price comparison — the whole promise here is "the cheapest key for *this*
 * game", and a page of other games breaks it.
 *
 * The rule is deliberately one-directional: every word of the query must be in
 * the listing's title, and the listing may add as many words as it likes. That
 * keeps the variants people do want — Deluxe Edition, GOTY, a repack, "Metal
 * Gear Solid V: The Definitive Experience" — while dropping a title that
 * simply does not contain what was typed.
 */

/** Words carrying no identity, dropped from both sides before comparing. */
const FILLER = new Set([
  'a',
  'an',
  'the',
  'of',
  'and',
  'for',
  'to',
  'in',
  'on',
  'with',
  'edition',
]);

/**
 * Sequels are written both ways, so both sides are converted to digits and
 * compared as digits: "Dark Souls III" answers "dark souls 3".
 *
 * Bare "i" is left alone on purpose — it is the English pronoun far more often
 * than it is a sequel number, and turning "I Am Setsuna" into "1 am setsuna"
 * buys nothing.
 */
const ROMAN: Record<string, string> = {
  ii: '2',
  iii: '3',
  iv: '4',
  v: '5',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
  x: '10',
  xi: '11',
  xii: '12',
  xiii: '13',
};

/**
 * Abbreviations people type and stores sometimes print. Kept short and
 * unambiguous on purpose: every entry here is a way for a listing to be
 * accepted, so a loose one ("ac", "re") would let a wrong game back in.
 */
const ALIASES: Record<string, string[]> = {
  gta: ['grand', 'theft', 'auto'],
  cod: ['call', 'duty'],
  mgs: ['metal', 'gear', 'solid'],
  ff: ['final', 'fantasy'],
  nfs: ['need', 'speed'],
  tlou: ['last', 'us'],
  rdr: ['red', 'dead', 'redemption'],
  dbd: ['dead', 'by', 'daylight'],
  botw: ['breath', 'wild'],
  totk: ['tears', 'kingdom'],
  wow: ['world', 'warcraft'],
  pubg: ['playerunknowns', 'battlegrounds'],
};

/**
 * Title to comparable words. Accents, trademarks and punctuation go; "&"
 * becomes "and" so "Rick & Morty" and "Rick and Morty" are one thing.
 */
export const relevanceTokens = (text: string): string[] => {
  const flattened = (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    // Combining accents, so "pokémon" and "pokemon" are the same word.
    .replace(/[̀-ͯ]/g, '')
    // An apostrophe joins, it does not separate: "Baldur's" is one word and
    // has to line up with the stores that spell it "Baldurs". Splitting there
    // would leave a stray "s" that no listing carries.
    .replace(/['‘’ʼ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!flattened) return [];

  return flattened
    .split(' ')
    .map((word) => ROMAN[word] ?? word)
    .filter((word) => word.length > 0 && !FILLER.has(word));
};

/**
 * What a listing can answer to. Only the listing side is widened, so an
 * abbreviation works whichever side spells it out: "Grand Theft Auto V" also
 * answers to "gta", and "GTA V" also answers to "grand theft auto".
 */
export const answerableWords = (name: string): Set<string> => {
  const words = new Set(relevanceTokens(name));

  for (const [alias, spelled] of Object.entries(ALIASES)) {
    if (words.has(alias)) {
      for (const word of spelled) words.add(word);
    } else if (spelled.every((word) => words.has(word))) {
      words.add(alias);
    }
  }

  return words;
};

/**
 * Whether `name` is a listing for `query`.
 *
 * Matching is word for word, never by substring: "dark" must not be answered
 * by "Darksiders", which is exactly the kind of near-miss a store's
 * recommendation engine returns.
 *
 * A query with nothing to match on — punctuation, or only filler — matches
 * everything rather than nothing. Dropping the whole page because the query
 * was odd would be a worse failure than showing too much.
 */
export const matchesQuery = (query: string, name: string): boolean => {
  const wanted = relevanceTokens(query);
  if (wanted.length === 0) return true;

  const present = answerableWords(name);
  return wanted.every((word) => present.has(word));
};
