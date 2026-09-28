import { PLATFORMS } from '../scrapers/platform';
import {
  DEFAULT_PLATFORMS,
  effectivePlatforms,
  normalisePlatforms,
  priceIsWanted,
} from './platform-preference';

/**
 * This decides which price a person is shown for a game they are watching.
 * Getting it wrong means quoting a PS5 key to somebody with no PlayStation,
 * who then buys a key that cannot be refunded. Every case below is written
 * from that failure backwards.
 */
describe('platform preference', () => {
  describe('normalisePlatforms', () => {
    it('keeps the platforms it knows', () => {
      expect(normalisePlatforms(['pc', 'playstation'])).toEqual([
        'pc',
        'playstation',
      ]);
    });

    it.each(PLATFORMS)('accepts %s on its own', (platform) => {
      expect(normalisePlatforms([platform])).toEqual([platform]);
    });

    it('accepts the casing and padding a form might send', () => {
      expect(normalisePlatforms([' PlayStation ', 'XBOX'])).toEqual([
        'playstation',
        'xbox',
      ]);
    });

    it('drops a repeat rather than filtering the same platform twice', () => {
      expect(normalisePlatforms(['pc', 'pc', 'pc'])).toEqual(['pc']);
    });

    describe('what it must refuse', () => {
      it('drops a platform it does not know instead of guessing', () => {
        // 'ps5' looking like PlayStation is exactly the guess that must not
        // happen: a preference is a promise, not a hint.
        expect(normalisePlatforms(['ps5'])).toEqual([...DEFAULT_PLATFORMS]);
        expect(normalisePlatforms(['steamdeck', 'pc'])).toEqual(['pc']);
      });

      it('does not turn an unknown entry into PC beside a real choice', () => {
        // Dropping it and coercing it to 'pc' look identical when the list is
        // ['ps5'] alone — both end up PC. They differ here, and the coercing
        // version quietly adds PC prices to a console-only list.
        expect(normalisePlatforms(['ps5', 'xbox'])).toEqual(['xbox']);
        expect(normalisePlatforms(['dreamcast', 'nintendo'])).toEqual([
          'nintendo',
        ]);
        expect(normalisePlatforms(['ps5', 'xbox'])).not.toContain('pc');
      });

      it.each([
        ['nothing at all', undefined],
        ['null', null],
        ['an empty list', []],
        ['a string instead of a list', 'pc'],
        ['a number', 7],
        ['an object', { pc: true }],
        ['a list of junk', [1, null, {}, [], true]],
        ['a list of empty strings', ['', '   ']],
      ])('falls back to PC when given %s', (_label, input) => {
        expect(normalisePlatforms(input)).toEqual([...DEFAULT_PLATFORMS]);
      });

      it('never falls back to every platform', () => {
        // An empty filter that means "show everything" would put console keys
        // in front of a PC-only buyer, which is the whole bug.
        expect(normalisePlatforms([])).not.toEqual(
          expect.arrayContaining(['playstation']),
        );
        expect(normalisePlatforms([]).length).toBe(1);
      });

      it('does not let a near-miss through by prefix or case tricks', () => {
        expect(normalisePlatforms(['pc-vr'])).toEqual(['pc']);
        expect(normalisePlatforms(['playstation5'])).toEqual(['pc']);
        expect(normalisePlatforms(['XBOX360'])).toEqual(['pc']);
      });
    });

    it('does not keep a reference to the default array', () => {
      // A caller mutating what it got back must not change the default for
      // everybody else in the process.
      const first = normalisePlatforms([]);
      first.push('xbox');
      expect(normalisePlatforms([])).toEqual(['pc']);
    });
  });

  describe('effectivePlatforms', () => {
    it('uses the account setting when the game has none', () => {
      expect(effectivePlatforms(null, ['xbox'])).toEqual(['xbox']);
    });

    it('lets the game override the account', () => {
      expect(effectivePlatforms(['playstation'], ['pc'])).toEqual([
        'playstation',
      ]);
    });

    it('treats a stored empty list on the game as not set', () => {
      // Otherwise the game's price would silently vanish from the list with
      // nothing on screen explaining it.
      expect(effectivePlatforms([], ['xbox'])).toEqual(['xbox']);
    });

    it('falls back to PC when neither is set', () => {
      expect(effectivePlatforms(null, null)).toEqual(['pc']);
      expect(effectivePlatforms(undefined, undefined)).toEqual(['pc']);
    });

    it('falls back to PC when the account setting is junk', () => {
      expect(effectivePlatforms(null, ['nope'])).toEqual(['pc']);
    });

    it('does not merge the two, it chooses', () => {
      // Merging would quietly widen what the person asked for.
      expect(effectivePlatforms(['xbox'], ['pc'])).toEqual(['xbox']);
    });
  });

  describe('priceIsWanted', () => {
    it('keeps a price on a wanted platform', () => {
      expect(priceIsWanted('playstation', ['pc', 'playstation'])).toBe(true);
    });

    it('rejects a console price for a PC-only person', () => {
      expect(priceIsWanted('playstation', ['pc'])).toBe(false);
      expect(priceIsWanted('xbox', ['pc'])).toBe(false);
      expect(priceIsWanted('nintendo', ['pc'])).toBe(false);
    });

    it('rejects a PC price for a console-only person', () => {
      expect(priceIsWanted('pc', ['playstation'])).toBe(false);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['the old column default', 'unknown'],
      ['an empty string', ''],
    ])('reads a price stored as %s as PC', (_label, stored) => {
      expect(priceIsWanted(stored, ['pc'])).toBe(true);
      expect(priceIsWanted(stored, ['playstation'])).toBe(false);
    });

    it('rejects everything when nothing is wanted', () => {
      // Not reachable through normalisePlatforms, and that is the point: if it
      // ever is, the answer is to show nothing rather than to show a key for
      // the wrong machine.
      expect(priceIsWanted('pc', [])).toBe(false);
    });
  });
});
