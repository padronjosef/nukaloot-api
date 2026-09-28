import { classifyListing, detectPlatform } from './platform';

/**
 * These exist because the failure they guard against costs somebody money:
 * a console key sold to a person with no console is not refundable.
 */
describe('listing platform', () => {
  describe('what must reach a PC catalogue', () => {
    it.each([
      'Elden Ring',
      'Hogwarts Legacy Deluxe Edition',
      'Hollow Knight Silksong Steam Key',
      'Elden Ring PC',
      'Cyberpunk 2077 (GOG)',
      'Anno 1800 Uplay',
    ])('keeps %s', (name) => {
      expect(classifyListing(name)).toBe('pc');
    });

    it('treats a title that names no machine as PC, since that is what this sells', () => {
      // Most listings say nothing. Demanding an explicit "PC" would throw the
      // catalogue away.
      expect(classifyListing('Baldurs Gate 3')).toBe('pc');
    });
  });

  describe('consoles are labelled, not hidden', () => {
    it.each([
      'Elden Ring (PS5)',
      'God of War Ragnarok Xbox',
      'Mario Kart 8 Nintendo Switch',
      'Gran Turismo 7 PS4',
      'Forza Horizon 5 Xbox Series X|S',
      'Some Game PSN',
    ])('drops %s', (name) => {
      expect(classifyListing(name)).toBe('console');
    });

    it('still refuses a listing that names a console and PC at once', () => {
      // The one case that stays dropped: a badge that guesses is worse than
      // no listing, because it is what sells the wrong key.
      // The one that used to slip through: the old rule was "console AND NOT
      // pc", so naming both made it look like a PC listing.
      expect(classifyListing('EA FC 25 PS5 & PC')).toBe('ambiguous');
      expect(classifyListing('Game of the Year — Xbox / Steam')).toBe(
        'ambiguous',
      );
    });

    it('reads the product URL too, not just the title', () => {
      expect(
        classifyListing('Elden Ring', 'https://eneba.com/ps5-elden-ring-psn'),
      ).toBe('console');
    });
  });

  describe('which console it names', () => {
    it.each([
      ['Elden Ring PS5', 'playstation'],
      ['Halo Xbox', 'xbox'],
      ['Zelda Nintendo Switch', 'nintendo'],
    ])('reads %s as %s', (name, expected) => {
      expect(detectPlatform(name)).toBe(expected);
    });

    it('falls back to pc when nothing says otherwise', () => {
      expect(detectPlatform('Elden Ring')).toBe('pc');
    });
  });
});
