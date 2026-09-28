import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Favourite, Price, User } from '../entities';
import { FavouritesController } from './favourites.controller';
import { FavouritesService } from './favourites.service';
import { GamesModule } from '../games/games.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Favourite, Price, User]),
    GamesModule,
    UsersModule,
  ],
  controllers: [FavouritesController],
  providers: [FavouritesService],
  exports: [FavouritesService],
})
export class FavouritesModule {}
