import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { GamesModule } from './games/games.module';
import { StoresModule } from './stores/stores.module';
import { PricesModule } from './prices/prices.module';
import { SearchModule } from './search/search.module';
import { ScrapersModule } from './scrapers/scrapers.module';
import { Game, Store, Price } from './entities';
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
        entities: [Game, Store, Price],
        synchronize: true, // dev only — use migrations in prod
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
  ],
})
export class AppModule {}
