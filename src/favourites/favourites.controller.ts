import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { BearerGuard } from '../auth/bearer.guard';
import { PLATFORMS } from '../scrapers/platform';
import { ActorGuard, type RequestWithActor } from '../users/actor.guard';
import { FavouritesService } from './favourites.service';

class AddFavouriteDto {
  @IsString()
  @MinLength(2)
  gameName: string;
}

/**
 * The account-wide setting. An unknown platform is refused outright rather
 * than quietly dropped: somebody who asked for "ps5" and got PC prices would
 * have no way to tell it had not worked.
 */
class SetPlatformsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(PLATFORMS.length)
  @IsIn(PLATFORMS as readonly string[], { each: true })
  platforms: string[];
}

/** The same, but null is allowed and means "follow the account again". */
class SetGamePlatformsDto {
  @ValidateIf((_o, value) => value !== null)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(PLATFORMS.length)
  @IsIn(PLATFORMS as readonly string[], { each: true })
  platforms: string[] | null;
}

/**
 * Acts only for whoever the token says it acts for, so nobody can read or
 * change somebody else's list.
 */
@Controller('favourites')
@UseGuards(BearerGuard, ActorGuard)
export class FavouritesController {
  constructor(private readonly favourites: FavouritesService) {}

  @Get()
  async list(@Req() req: RequestWithActor) {
    const items = await this.favourites.listFor(req.actor!.id);
    const tracked = await this.favourites.countTracked(req.actor!.id);
    const platforms = await this.favourites.platformsFor(req.actor!.id);
    return { items, tracked, limit: this.favourites.limit, platforms };
  }

  @Post()
  async add(@Req() req: RequestWithActor, @Body() body: AddFavouriteDto) {
    const item = await this.favourites.add(req.actor!.id, body.gameName);
    const tracked = await this.favourites.countTracked(req.actor!.id);
    return { item, tracked, limit: this.favourites.limit };
  }

  @Put('platforms')
  async setPlatforms(
    @Req() req: RequestWithActor,
    @Body() body: SetPlatformsDto,
  ) {
    const platforms = await this.favourites.setPlatforms(
      req.actor!.id,
      body.platforms,
    );
    return { platforms };
  }

  @Patch(':gameId/platforms')
  async setGamePlatforms(
    @Req() req: RequestWithActor,
    @Param('gameId') gameId: string,
    @Body() body: SetGamePlatformsDto,
  ) {
    const platforms = await this.favourites.setGamePlatforms(
      req.actor!.id,
      gameId,
      body.platforms,
    );
    return { platforms };
  }

  @Delete(':gameId')
  @HttpCode(204)
  async remove(@Req() req: RequestWithActor, @Param('gameId') gameId: string) {
    await this.favourites.remove(req.actor!.id, gameId);
  }
}
