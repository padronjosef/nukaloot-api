import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * The rules that decide whether a password is allowed at all, exercised
 * directly: they are what stands between the account and a guessable secret.
 */
describe('password rules', () => {
  const assert = (password: string) =>
    (
      new UsersService({} as never) as unknown as {
        assertPassword: (value: string) => void;
      }
    ).assertPassword(password);

  it('accepts a real one', () => {
    expect(() => assert('a-decent-password')).not.toThrow();
  });

  describe('what it must refuse', () => {
    it.each(['', 'short', '123456789'])(
      'refuses %p for being too short',
      (p) => {
        expect(() => assert(p)).toThrow(BadRequestException);
      },
    );

    it('refuses a password made only of spaces', () => {
      // Ten spaces clears a naive length check while being no secret at all.
      expect(() => assert('          ')).toThrow(BadRequestException);
    });

    it('refuses one padded out to length with spaces', () => {
      expect(() => assert('  abc     ')).toThrow(BadRequestException);
    });
  });
});
