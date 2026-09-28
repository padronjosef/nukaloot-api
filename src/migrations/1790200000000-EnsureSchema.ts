import { MigrationInterface, QueryRunner } from 'typeorm';
import { InitialSchema1790128255470 } from './1790128255470-InitialSchema';

/**
 * Repairs a database where InitialSchema was recorded as applied without
 * having done its job.
 *
 * The first version of that migration guarded itself with "does `games`
 * exist" and returned early when it did. On production, built by
 * `synchronize` back when the schema was only games, stores and prices, it
 * returned early, TypeORM wrote it down as executed, and the API came up
 * without a `users` table. Fixing the file is not enough: an applied
 * migration never runs again, which is the whole point of migrations.
 *
 * So this is the follow-up. It runs the corrected statements, every one of
 * them guarded, which means it fills the gap on production and does nothing
 * at all on a database where InitialSchema already built everything.
 */
export class EnsureSchema1790200000000 implements MigrationInterface {
  name = 'EnsureSchema1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await new InitialSchema1790128255470().up(queryRunner);
  }

  /**
   * Nothing. Reverting this would mean dropping tables that InitialSchema is
   * still recorded as owning, and its own `down` is the one that does that.
   */
  public async down(): Promise<void> {
    return Promise.resolve();
  }
}
