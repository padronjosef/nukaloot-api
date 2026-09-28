import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('accepts the password it stored', async () => {
    const stored = await hashPassword('a-real-password');
    await expect(verifyPassword('a-real-password', stored)).resolves.toBe(true);
  });

  it('never stores the password itself', async () => {
    const stored = await hashPassword('a-real-password');
    expect(stored).not.toContain('a-real-password');
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('gives two different hashes for the same password', async () => {
    // A shared salt would let one cracked hash unlock every account using
    // that password.
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(a).not.toBe(b);
  });

  describe('what it must refuse', () => {
    it('refuses the wrong password', async () => {
      const stored = await hashPassword('a-real-password');
      await expect(verifyPassword('not-it', stored)).resolves.toBe(false);
    });

    it('refuses a near miss', async () => {
      const stored = await hashPassword('a-real-password');
      await expect(verifyPassword('a-real-passworD', stored)).resolves.toBe(
        false,
      );
    });

    it.each([
      ['empty', ''],
      ['not our format', 'plaintext'],
      ['another scheme', 'bcrypt$abc$def'],
      ['missing the key', 'scrypt$abc'],
      ['salt and key swapped for junk', 'scrypt$zz$zz'],
    ])('refuses a stored value that is %s', async (_label, stored) => {
      await expect(verifyPassword('a-real-password', stored)).resolves.toBe(
        false,
      );
    });
  });
});
