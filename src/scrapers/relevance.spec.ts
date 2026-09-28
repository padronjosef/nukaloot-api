import { answerableWords, matchesQuery, relevanceTokens } from './relevance';

/**
 * Two ways to get this wrong, and both are on the page at once:
 *
 *  - too loose, and "dark souls 3" answers with Lies of P and Death's Door;
 *  - too strict, and a real listing for the game disappears, which is the
 *    catalogue quietly shrinking with nothing to show that it happened.
 *
 * So each block below has a "must find" half and a "must not find" half.
 */
describe('search relevance', () => {
  describe('dark souls 3 — the search that started this', () => {
    const query = 'dark souls 3';

    it.each([
      'Dark Souls 3',
      'DARK SOULS™ III',
      'Dark Souls III Deluxe Edition',
      'Dark Souls 3: Season Pass',
      'Dark Souls 3 Deluxe Edition - Pc (Steam)',
      'DARK SOULS III - The Ringed City',
      'Dark Souls III: The Fire Fades Edition',
      'Dark Souls 3 (PC) Steam Key GLOBAL',
    ])('finds %s', (name) => {
      expect(matchesQuery(query, name)).toBe(true);
    });

    it.each([
      'Lies Of P Deluxe Edition - Pc (Steam)',
      'Lies Of P: Overture Bundle - Pc (Steam)',
      "Death's Door Deluxe Edition - Pc (Steam)",
      'Elden Ring Nightreign Deluxe Edition - Pc (Steam)',
      'Clair Obscur: Expedition 33 Deluxe Edition - Pc (Steam)',
      'Phantom Blade Zero Digital Deluxe Edition - Pc (Steam)',
      'Nioh 2 - The Complete Edition',
      'Onimusha: Way of the Sword',
      'Sekiro: Shadows Die Twice',
    ])('does not find %s', (name) => {
      expect(matchesQuery(query, name)).toBe(false);
    });

    it('does not answer "dark" with "Darksiders"', () => {
      // A substring match would: "dark" is inside "darksiders". This is why
      // the comparison is word for word.
      expect(matchesQuery(query, 'Darksiders III Deluxe Edition')).toBe(false);
      expect(matchesQuery('dark souls', 'Darksiders Souls 3')).toBe(false);
    });

    it('does not answer the number alone', () => {
      expect(matchesQuery(query, 'Deus Ex 3')).toBe(false);
    });

    it('keeps the other Dark Souls games out', () => {
      // Someone asking for 3 does not want 2, even though most words match.
      expect(
        matchesQuery(query, 'Dark Souls II: Scholar of the First Sin'),
      ).toBe(false);
      expect(matchesQuery(query, 'Dark Souls Remastered')).toBe(false);
    });
  });

  describe('the variants that must keep working', () => {
    it.each([
      ['metal gear solid v', 'Metal Gear Solid V: The Phantom Pain'],
      ['metal gear solid 5', 'Metal Gear Solid V: The Definitive Experience'],
      ['metal gear solid v', 'METAL GEAR SOLID V: GROUND ZEROES'],
      ['elden ring', 'ELDEN RING Shadow of the Erdtree Edition'],
      ['elden ring', 'Elden Ring Deluxe Edition'],
      ['hollow knight silksong', 'Hollow Knight: Silksong'],
      ['gta 5', 'Grand Theft Auto V'],
      ['resident evil 4', 'Resident Evil 4 Remake — Deluxe Edition'],
      ['the witcher 3', 'The Witcher 3: Wild Hunt - Game of the Year Edition'],
      ['cyberpunk 2077', 'Cyberpunk 2077: Ultimate Edition (Repack)'],
      ['final fantasy vii', 'FINAL FANTASY VII REMAKE INTERGRADE'],
      ['final fantasy 7', 'FINAL FANTASY VII REBIRTH'],
    ])('%s finds %s', (query, name) => {
      expect(matchesQuery(query, name)).toBe(true);
    });

    it('finds a title whose words are written differently', () => {
      expect(matchesQuery('pokemon', 'Pokémon Legends: Z-A')).toBe(true);
      expect(matchesQuery('rick and morty', 'Rick & Morty Game')).toBe(true);
      expect(matchesQuery("assassin's creed", 'Assassins Creed Mirage')).toBe(
        true,
      );
      expect(matchesQuery('spider-man', 'Marvel’s Spider Man Remastered')).toBe(
        true,
      );
    });

    it("ignores the store's own platform and region wording", () => {
      expect(
        matchesQuery('baldurs gate 3', "Baldur's Gate 3 - Pc (Steam) EUROPE"),
      ).toBe(true);
    });

    it('is not fooled into strictness by the word "edition" in the query', () => {
      // "Edition" carries no identity, so asking for it must not rule out the
      // listings that do not spell it.
      expect(matchesQuery('elden ring edition', 'Elden Ring')).toBe(true);
    });

    it('matches regardless of word order', () => {
      // Stores reorder titles constantly: "Pc - Elden Ring".
      expect(matchesQuery('elden ring', 'Pc (Steam) - Elden Ring')).toBe(true);
    });
  });

  describe('sequel numbers written both ways', () => {
    it.each([
      ['dark souls 2', 'Dark Souls II'],
      ['dark souls ii', 'Dark Souls 2'],
      ['civilization 6', 'Sid Meier’s Civilization VI'],
      ['diablo 4', 'Diablo IV'],
      ['street fighter 6', 'Street Fighter VI'],
    ])('%s finds %s', (query, name) => {
      expect(matchesQuery(query, name)).toBe(true);
    });

    it('does not turn a lone "I" into a number', () => {
      // "I Am Setsuna" is not "1 Am Setsuna", and the pronoun shows up far
      // more often than the sequel number ever would.
      expect(relevanceTokens('I Am Setsuna')).toEqual(['i', 'am', 'setsuna']);
      expect(matchesQuery('i am setsuna', 'I Am Setsuna')).toBe(true);
    });

    it('still tells different numbers apart', () => {
      expect(matchesQuery('diablo 4', 'Diablo III')).toBe(false);
      expect(matchesQuery('dark souls ii', 'Dark Souls III')).toBe(false);
    });
  });

  describe('what it must refuse', () => {
    it('refuses a listing missing any one word of the query', () => {
      expect(matchesQuery('hollow knight silksong', 'Hollow Knight')).toBe(
        false,
      );
      expect(matchesQuery('red dead redemption 2', 'Red Dead Redemption')).toBe(
        false,
      );
    });

    it('refuses a listing that only shares a common word', () => {
      expect(matchesQuery('dead space', 'Red Dead Redemption 2')).toBe(false);
      expect(matchesQuery('the last of us', 'The Last Spell')).toBe(false);
    });

    it('refuses a partial word, in either direction', () => {
      expect(matchesQuery('ring', 'Elden Ringside')).toBe(false);
      expect(matchesQuery('elden ringside', 'Elden Ring')).toBe(false);
    });

    it('refuses an empty listing name', () => {
      expect(matchesQuery('elden ring', '')).toBe(false);
    });
  });

  describe('when the query has nothing to match on', () => {
    // Showing everything is the safer failure here: an empty page for a query
    // we could not read looks like the site is broken.
    it.each([
      ['empty', ''],
      ['spaces', '   '],
      ['punctuation', '!!!'],
      ['filler only', 'the of and'],
    ])('keeps every listing when the query is %s', (_label, query) => {
      expect(matchesQuery(query, 'Anything At All')).toBe(true);
    });
  });

  describe('abbreviations', () => {
    // Stores spell these out and people type the short form, or the other way
    // round. Without this the filter would throw away the very listing the
    // store's own search got right.
    it.each([
      ['gta 5', 'Grand Theft Auto V'],
      ['grand theft auto 5', 'GTA V - Pc (Steam)'],
      ['gta 5', 'GTA V Premium Edition'],
      ['cod', 'Call of Duty: Black Ops 7'],
      ['mgs 3', 'Metal Gear Solid Δ: Snake Eater'.replace('Δ', '3')],
      ['ff 7', 'Final Fantasy VII Remake'],
      ['rdr 2', 'Red Dead Redemption 2'],
      ['red dead redemption 2', 'RDR 2 Ultimate Edition'],
    ])('%s finds %s', (query, name) => {
      expect(matchesQuery(query, name)).toBe(true);
    });

    it('does not make an abbreviation match a different game', () => {
      expect(matchesQuery('gta 5', 'Grand Theft Auto IV')).toBe(false);
      expect(matchesQuery('gta', 'Mafia: Definitive Edition')).toBe(false);
      expect(matchesQuery('ff 7', 'Final Fantasy XVI')).toBe(false);
    });

    it('only widens the listing, never the query', () => {
      // "Grand" on its own must not be satisfied by a listing that merely
      // knows the alias.
      expect(matchesQuery('grand theft auto 5', 'Theft Auto V')).toBe(false);
    });

    it('adds the alias to a spelled-out title and the words to an abbreviated one', () => {
      expect(answerableWords('Grand Theft Auto V')).toEqual(
        new Set(['grand', 'theft', 'auto', '5', 'gta']),
      );
      expect(answerableWords('GTA V')).toEqual(
        new Set(['gta', '5', 'grand', 'theft', 'auto']),
      );
    });

    it('leaves a title that has nothing to do with an alias alone', () => {
      expect(answerableWords('Elden Ring')).toEqual(new Set(['elden', 'ring']));
    });
  });

  describe('relevanceTokens', () => {
    it('splits on anything that is not a letter or digit', () => {
      expect(relevanceTokens('Dark Souls III: The Fire Fades')).toEqual([
        'dark',
        'souls',
        '3',
        'fire',
        'fades',
      ]);
    });

    it('drops filler but never a real word', () => {
      expect(relevanceTokens('Lies of P')).toEqual(['lies', 'p']);
    });

    it('keeps a one-letter title word', () => {
      // "P" is the whole name. Dropping short words would lose the game.
      expect(relevanceTokens('P')).toEqual(['p']);
    });

    it('returns nothing for text with no words', () => {
      expect(relevanceTokens('—!!—')).toEqual([]);
      expect(relevanceTokens('')).toEqual([]);
    });

    it('survives a name that is not a string', () => {
      // Scrapers have sent undefined here before; a crash would take the whole
      // search down rather than one listing.
      expect(relevanceTokens(undefined as unknown as string)).toEqual([]);
      expect(matchesQuery('elden ring', undefined as unknown as string)).toBe(
        false,
      );
    });
  });
});
