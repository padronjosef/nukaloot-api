import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the column a pre-existing `prices` table is missing.
 *
 * The baseline creates tables, and a table that is already there is left
 * exactly as it was found, columns and all. Production's `prices` was built by
 * `synchronize` before platforms existed, so it came through the baseline
 * untouched and every search failed on "column Price.platform does not exist".
 *
 * Its default is 'pc', which is also what the code reads an unknown value as:
 * a listing that says nothing about a machine is a PC listing, and that is
 * what every row saved before this was.
 */
export class AddPricePlatform1790210000000 implements MigrationInterface {
  name = 'AddPricePlatform1790210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "prices" ADD COLUMN IF NOT EXISTS "platform" character varying(16) NOT NULL DEFAULT 'pc'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "prices" DROP COLUMN IF EXISTS "platform"`,
    );
  }
}
