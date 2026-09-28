import type { QueryRunner } from 'typeorm';
import { InitialSchema1790128255470 } from './1790128255470-InitialSchema';

/**
 * This migration is a baseline, and the case it has to survive is the one in
 * production: a database `synchronize` built before migrations existed. Every
 * table is already there, so running the CREATEs fails on the first one and
 * takes the boot down with it.
 */
const fakeRunner = (schemaExists: boolean) => {
  const queries: string[] = [];
  const runner = {
    hasTable: () => Promise.resolve(schemaExists),
    query: (sql: string) => {
      queries.push(sql);
      return Promise.resolve();
    },
  } as unknown as QueryRunner;

  return { runner, queries };
};

describe('InitialSchema', () => {
  it('builds the schema on a database that has none', async () => {
    const { runner, queries } = fakeRunner(false);

    await new InitialSchema1790128255470().up(runner);

    expect(queries.some((q) => q.includes('CREATE TABLE "games"'))).toBe(true);
    expect(queries.some((q) => q.includes('CREATE TABLE "favourites"'))).toBe(
      true,
    );
  });

  describe('what it must not do', () => {
    it('writes nothing at all when the schema is already there', async () => {
      // One CREATE against an existing table throws, the migration aborts and
      // the API crash-loops. Doing nothing is the whole point.
      const { runner, queries } = fakeRunner(true);

      await new InitialSchema1790128255470().up(runner);

      expect(queries).toEqual([]);
    });

    it('decides by looking, not by assuming', async () => {
      const hasTable = jest.fn().mockResolvedValue(true);
      const runner = {
        hasTable,
        query: () => Promise.resolve(),
      } as unknown as QueryRunner;

      await new InitialSchema1790128255470().up(runner);

      expect(hasTable).toHaveBeenCalled();
    });
  });

  it('drops what it made, in an order the foreign keys allow', async () => {
    const { runner, queries } = fakeRunner(false);

    await new InitialSchema1790128255470().down(runner);

    const dropped = queries
      .filter((q) => q.startsWith('DROP TABLE'))
      .map((q) => q.replace(/DROP TABLE "(.+)"/, '$1'));

    // Children before parents, or Postgres refuses.
    expect(dropped.indexOf('favourites')).toBeLessThan(
      dropped.indexOf('games'),
    );
    expect(dropped.indexOf('prices')).toBeLessThan(dropped.indexOf('stores'));
  });
});
