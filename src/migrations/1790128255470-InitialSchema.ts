import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1790128255470 implements MigrationInterface {
  name = 'InitialSchema1790128255470';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // This is a baseline. Databases built by `synchronize` before migrations
    // existed already have every table in here, and running it against one of
    // those fails on the first CREATE and takes the boot down with it. Their
    // schema is already what this describes, so there is nothing to do.
    const built = await queryRunner.hasTable('games');
    if (built) return;

    await queryRunner.query(
      `CREATE TABLE "stores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "url" character varying NOT NULL, "logoUrl" character varying, CONSTRAINT "UQ_a205ca5a37fa5e10005f003aaf3" UNIQUE ("name"), CONSTRAINT "PK_7aa6e7d71fa7acdd7ca43d7c9cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "prices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "price" numeric(10,2) NOT NULL, "originalPrice" numeric(10,2), "currency" character varying NOT NULL DEFAULT 'USD', "productUrl" character varying NOT NULL, "gameName" character varying NOT NULL, "gameType" character varying NOT NULL DEFAULT 'other', "platform" character varying(16) NOT NULL DEFAULT 'pc', "imageUrl" character varying NOT NULL DEFAULT '', "backgroundUrl" character varying NOT NULL DEFAULT '', "releaseDate" character varying NOT NULL DEFAULT '', "scrapedAt" TIMESTAMP NOT NULL DEFAULT now(), "gameId" uuid, "storeId" uuid, CONSTRAINT "PK_2e40b9e4e631a53cd514d82ccd2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "games" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "coverUrl" character varying, "failedStores" jsonb NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_095bbaa4f028fa5a03e37f631d6" UNIQUE ("slug"), CONSTRAINT "PK_c9b16b62917b5595af982d66337" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "search_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "query" character varying NOT NULL, "normalizedQuery" character varying NOT NULL, "ip" character varying(45), "country" character varying(2), "city" character varying, "region" character varying, "currencyRegion" character varying(8), "userAgent" text, "referer" text, "isBot" boolean NOT NULL DEFAULT false, "cacheHit" boolean NOT NULL DEFAULT false, "resultCount" integer NOT NULL DEFAULT '0', "visitorId" character varying(32), "userId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a7de6b052b1a608961dc46e843d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f2e1527b3f5fd6dad311f3fe91" ON "search_logs" ("visitorId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8c823ac135c1cdfe48a79854fa" ON "search_logs" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9e32da7852169235ea7c12dd91" ON "search_logs" ("country") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a228d27dbed5f5a42c09b98c69" ON "search_logs" ("normalizedQuery") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_03387e5e075745ccaf0fc72ad7" ON "search_logs" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying, "passwordHash" character varying, "googleId" character varying, "avatarUrl" character varying, "emailVerified" boolean NOT NULL DEFAULT false, "verificationTokenHash" character varying, "verificationExpiresAt" TIMESTAMP WITH TIME ZONE, "verificationSentAt" TIMESTAMP WITH TIME ZONE, "sessionsValidFrom" TIMESTAMP WITH TIME ZONE, "trackedPlatforms" text, "role" character varying(16) NOT NULL DEFAULT 'user', "isActive" boolean NOT NULL DEFAULT true, "lastLoginAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f382af58ab36057334fb262efd" ON "users" ("googleId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "favourites" ("userId" uuid NOT NULL, "gameId" uuid NOT NULL, "source" character varying(16) NOT NULL DEFAULT 'manual', "tracked" boolean NOT NULL DEFAULT true, "platforms" text, "priceWhenAdded" numeric(10,2), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0f2c8899f7714e2eb9e1fbca1ee" PRIMARY KEY ("userId", "gameId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a7dca0d9d21de69ad51b962a87" ON "favourites" ("gameId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "prices" ADD CONSTRAINT "FK_b6dbd2ee3bf57092f94d479425d" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "prices" ADD CONSTRAINT "FK_62687417734285fe40e103ea232" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" ADD CONSTRAINT "FK_b75b5e4a2475d03acfe11eac1d1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" ADD CONSTRAINT "FK_a7dca0d9d21de69ad51b962a87b" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /**
   * Drops everything this created. Only ever correct on a database this
   * migration actually built: on one that predates it, `up` did nothing and
   * reverting would delete a schema it never made.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favourites" DROP CONSTRAINT "FK_a7dca0d9d21de69ad51b962a87b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" DROP CONSTRAINT "FK_b75b5e4a2475d03acfe11eac1d1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prices" DROP CONSTRAINT "FK_62687417734285fe40e103ea232"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prices" DROP CONSTRAINT "FK_b6dbd2ee3bf57092f94d479425d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a7dca0d9d21de69ad51b962a87"`,
    );
    await queryRunner.query(`DROP TABLE "favourites"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f382af58ab36057334fb262efd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_03387e5e075745ccaf0fc72ad7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a228d27dbed5f5a42c09b98c69"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9e32da7852169235ea7c12dd91"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8c823ac135c1cdfe48a79854fa"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f2e1527b3f5fd6dad311f3fe91"`,
    );
    await queryRunner.query(`DROP TABLE "search_logs"`);
    await queryRunner.query(`DROP TABLE "games"`);
    await queryRunner.query(`DROP TABLE "prices"`);
    await queryRunner.query(`DROP TABLE "stores"`);
  }
}
