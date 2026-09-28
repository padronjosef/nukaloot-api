import type { QueryRunner } from 'typeorm';
import { InitialSchema1790128255470 } from '../1790128255470-InitialSchema';

/**
 * This has to land on three different databases: an empty one, one already
 * fully migrated, and the half-built one production actually had, made by
 * `synchronize` when the schema was only games, stores and prices.
 *
 * The first version guarded the whole migration behind "does `games` exist",
 * which on that third database skipped everything, so the API came up without
 * a `users` table and crash-looped. What follows is that lesson: no statement
 * here may assume what is already there, and none may be skipped wholesale.
 */
const record = () => {
  const queries: string[] = [];
  const runner = {
    hasTable: () => Promise.resolve(true),
    query: (sql: string) => {
      queries.push(sql);
      return Promise.resolve();
    },
  } as unknown as QueryRunner;

  return { runner, queries };
};

const TABLES = [
  'stores',
  'prices',
  'games',
  'search_logs',
  'users',
  'favourites',
];

describe('InitialSchema', () => {
  describe('up', () => {
    it('creates every table the entities need', async () => {
      const { runner, queries } = record();
      await new InitialSchema1790128255470().up(runner);
      const sql = queries.join('\n');

      for (const table of TABLES) {
        expect(sql).toContain(`"${table}"`);
      }
    });

    it('still creates the newer tables on a database that has the older ones', async () => {
      // The regression, exactly. A runner answering "yes, that table is there"
      // to everything must not make this give up: production had games, stores
      // and prices, and needed users, favourites and search_logs.
      const { runner, queries } = record();
      await new InitialSchema1790128255470().up(runner);

      expect(queries.some((q) => q.includes('"users"'))).toBe(true);
      expect(queries.some((q) => q.includes('"favourites"'))).toBe(true);
      expect(queries.some((q) => q.includes('"search_logs"'))).toBe(true);
    });

    it('never decides by asking whether one table exists', async () => {
      // Any single table is the wrong thing to judge a whole schema by.
      const hasTable = jest.fn().mockResolvedValue(true);
      const runner = {
        hasTable,
        query: () => Promise.resolve(),
      } as unknown as QueryRunner;

      await new InitialSchema1790128255470().up(runner);

      expect(hasTable).not.toHaveBeenCalled();
    });

    describe('every statement survives the object already existing', () => {
      it('guards each CREATE TABLE', async () => {
        const { runner, queries } = record();
        await new InitialSchema1790128255470().up(runner);

        const creates = queries.filter((q) => q.includes('CREATE TABLE'));
        expect(creates).toHaveLength(TABLES.length);
        for (const q of creates) {
          expect(q).toContain('CREATE TABLE IF NOT EXISTS');
        }
      });

      it('guards each index', async () => {
        const { runner, queries } = record();
        await new InitialSchema1790128255470().up(runner);

        const creates = queries.filter((q) => q.includes('CREATE INDEX'));
        expect(creates.length).toBeGreaterThan(0);
        for (const q of creates) {
          expect(q).toContain('CREATE INDEX IF NOT EXISTS');
        }
      });

      it('guards each unique index', async () => {
        const { runner, queries } = record();
        await new InitialSchema1790128255470().up(runner);

        const creates = queries.filter((q) =>
          q.includes('CREATE UNIQUE INDEX'),
        );
        expect(creates.length).toBeGreaterThan(0);
        for (const q of creates) {
          expect(q).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
        }
      });

      it('guards each foreign key, which has no IF NOT EXISTS of its own', async () => {
        // Postgres offers none on ADD CONSTRAINT, so these have to look in
        // pg_constraint themselves or a second run fails.
        const { runner, queries } = record();
        await new InitialSchema1790128255470().up(runner);

        const keys = queries.filter((q) => q.includes('ADD CONSTRAINT'));
        expect(keys).toHaveLength(4);
        for (const q of keys) {
          expect(q).toContain('pg_constraint');
          expect(q).toContain('IF NOT EXISTS');
        }
      });
    });
  });

  describe('down', () => {
    it('drops the tables children first, or the foreign keys refuse', async () => {
      const { runner, queries } = record();
      await new InitialSchema1790128255470().down(runner);

      const dropped = queries
        .filter((q) => q.startsWith('DROP TABLE'))
        .map((q) => q.replace(/DROP TABLE IF EXISTS "(.+)"/, '$1'));

      expect(dropped.indexOf('favourites')).toBeLessThan(
        dropped.indexOf('games'),
      );
      expect(dropped.indexOf('prices')).toBeLessThan(dropped.indexOf('stores'));
    });

    it('survives an object that was never created here', async () => {
      // Where `up` found half the schema present, the other half was never
      // made by this migration; an unguarded DROP would fail the revert.
      const { runner, queries } = record();
      await new InitialSchema1790128255470().down(runner);

      for (const q of queries) {
        expect(q).toContain('IF EXISTS');
      }
    });
  });
});
