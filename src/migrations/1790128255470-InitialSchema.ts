import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds a foreign key only if one by that name is not already there. */
const addForeignKey = (
  table: string,
  name: string,
  column: string,
  references: string,
) =>
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
       ALTER TABLE "${table}" ADD CONSTRAINT "${name}"
         FOREIGN KEY ("${column}") REFERENCES "${references}"("id")
         ON DELETE CASCADE ON UPDATE NO ACTION;
     END IF;
   END $$`;

export class InitialSchema1790128255470 implements MigrationInterface {
  name = 'InitialSchema1790128255470';

  /**
   * The baseline, applied object by object.
   *
   * It has to land on three different databases: an empty one, one already
   * fully migrated, and the one this was written for, built by `synchronize`
   * before migrations existed and carrying only the tables that release had.
   *
   * An all-or-nothing guard was the first attempt and it was wrong: seeing
   * `games` it skipped everything, so production came up without `users` and
   * crash-looped. Each object checks for itself now, which is the only version
   * that is true on all three.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "stores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "url" character varying NOT NULL, "logoUrl" character varying, CONSTRAINT "UQ_a205ca5a37fa5e10005f003aaf3" UNIQUE ("name"), CONSTRAINT "PK_7aa6e7d71fa7acdd7ca43d7c9cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "prices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "price" numeric(10,2) NOT NULL, "originalPrice" numeric(10,2), "currency" character varying NOT NULL DEFAULT 'USD', "productUrl" character varying NOT NULL, "gameName" character varying NOT NULL, "gameType" character varying NOT NULL DEFAULT 'other', "platform" character varying(16) NOT NULL DEFAULT 'pc', "imageUrl" character varying NOT NULL DEFAULT '', "backgroundUrl" character varying NOT NULL DEFAULT '', "releaseDate" character varying NOT NULL DEFAULT '', "scrapedAt" TIMESTAMP NOT NULL DEFAULT now(), "gameId" uuid, "storeId" uuid, CONSTRAINT "PK_2e40b9e4e631a53cd514d82ccd2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "games" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "coverUrl" character varying, "failedStores" jsonb NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_095bbaa4f028fa5a03e37f631d6" UNIQUE ("slug"), CONSTRAINT "PK_c9b16b62917b5595af982d66337" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "search_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "query" character varying NOT NULL, "normalizedQuery" character varying NOT NULL, "ip" character varying(45), "country" character varying(2), "city" character varying, "region" character varying, "currencyRegion" character varying(8), "userAgent" text, "referer" text, "isBot" boolean NOT NULL DEFAULT false, "cacheHit" boolean NOT NULL DEFAULT false, "resultCount" integer NOT NULL DEFAULT '0', "visitorId" character varying(32), "userId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a7de6b052b1a608961dc46e843d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_f2e1527b3f5fd6dad311f3fe91" ON "search_logs" ("visitorId") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_8c823ac135c1cdfe48a79854fa" ON "search_logs" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_9e32da7852169235ea7c12dd91" ON "search_logs" ("country") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_a228d27dbed5f5a42c09b98c69" ON "search_logs" ("normalizedQuery") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_03387e5e075745ccaf0fc72ad7" ON "search_logs" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying, "passwordHash" character varying, "googleId" character varying, "avatarUrl" character varying, "emailVerified" boolean NOT NULL DEFAULT false, "verificationTokenHash" character varying, "verificationExpiresAt" TIMESTAMP WITH TIME ZONE, "verificationSentAt" TIMESTAMP WITH TIME ZONE, "sessionsValidFrom" TIMESTAMP WITH TIME ZONE, "trackedPlatforms" text, "role" character varying(16) NOT NULL DEFAULT 'user', "isActive" boolean NOT NULL DEFAULT true, "lastLoginAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_f382af58ab36057334fb262efd" ON "users" ("googleId") `,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "favourites" ("userId" uuid NOT NULL, "gameId" uuid NOT NULL, "source" character varying(16) NOT NULL DEFAULT 'manual', "tracked" boolean NOT NULL DEFAULT true, "platforms" text, "priceWhenAdded" numeric(10,2), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0f2c8899f7714e2eb9e1fbca1ee" PRIMARY KEY ("userId", "gameId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_a7dca0d9d21de69ad51b962a87" ON "favourites" ("gameId") `,
    );

    await queryRunner.query(
      addForeignKey(
        'prices',
        'FK_b6dbd2ee3bf57092f94d479425d',
        'gameId',
        'games',
      ),
    );
    await queryRunner.query(
      addForeignKey(
        'prices',
        'FK_62687417734285fe40e103ea232',
        'storeId',
        'stores',
      ),
    );
    await queryRunner.query(
      addForeignKey(
        'favourites',
        'FK_b75b5e4a2475d03acfe11eac1d1',
        'userId',
        'users',
      ),
    );
    await queryRunner.query(
      addForeignKey(
        'favourites',
        'FK_a7dca0d9d21de69ad51b962a87b',
        'gameId',
        'games',
      ),
    );
  }

  /**
   * Drops what this created. Guarded the same way, because a database where
   * `up` found half the schema already present never had the other half made
   * here, and dropping what is not there would fail the revert.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favourites" DROP CONSTRAINT IF EXISTS "FK_a7dca0d9d21de69ad51b962a87b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" DROP CONSTRAINT IF EXISTS "FK_b75b5e4a2475d03acfe11eac1d1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prices" DROP CONSTRAINT IF EXISTS "FK_62687417734285fe40e103ea232"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prices" DROP CONSTRAINT IF EXISTS "FK_b6dbd2ee3bf57092f94d479425d"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_a7dca0d9d21de69ad51b962a87"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "favourites"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_f382af58ab36057334fb262efd"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_03387e5e075745ccaf0fc72ad7"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_a228d27dbed5f5a42c09b98c69"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_9e32da7852169235ea7c12dd91"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_8c823ac135c1cdfe48a79854fa"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_f2e1527b3f5fd6dad311f3fe91"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "search_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "games"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stores"`);
  }
}
