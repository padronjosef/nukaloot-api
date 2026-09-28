import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { GamesModule } from './games/games.module';
import { StoresModule } from './stores/stores.module';
import { PricesModule } from './prices/prices.module';
import { SearchModule } from './search/search.module';
import { ScrapersModule } from './scrapers/scrapers.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { UsersModule } from './users/users.module';
import { FavouritesModule } from './favourites/favourites.module';
import { Game, Store, Price, SearchLog, User, Favourite } from './entities';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_NAME', 'game_prices'),
        entities: [Game, Store, Price, SearchLog, User, Favourite],
        /**
         * Off unless asked for. `synchronize` rewrites the schema to match
         * the entities on every boot: in production that is a deploy able to
         * drop a column, and with it the data in it, because somebody renamed
         * a field. Migrations are the record of what changed and the only way
         * back. DB_SYNCHRONIZE=true is for a throwaway local database.
         */
        synchronize: config.get('DB_SYNCHRONIZE') === 'true',
        migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
        // Applied on boot so a deploy cannot start against a schema older
        // than the code that needs it.
        migrationsRun: config.get('DB_SYNCHRONIZE') !== 'true',
        ssl:
          config.get('DB_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
    HttpModule,
    GamesModule,
    StoresModule,
    PricesModule,
    SearchModule,
    ScrapersModule,
    AnalyticsModule,
    UsersModule,
    FavouritesModule,
  ],
})
export class AppModule {}
