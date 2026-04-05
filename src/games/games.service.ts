import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Game } from '../entities';

/**
 * Standardize a game name for storage and matching:
 * - Remove trademark symbols (™®©)
 * - Normalize unicode to ASCII (é→e, ü→u, etc.)
 * - Collapse multiple spaces
 * - Trim
 * - Title case
 */
export function standardizeName(name: string): string {
  return name
    .replace(/[™®©]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /\w\S*/g,
      (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    );
}

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game)
    private readonly gameRepo: Repository<Game>,
  ) {}

  async findOrCreate(name: string): Promise<Game> {
    const standardized = standardizeName(name);
    const slug = this.slugify(standardized);
    let game = await this.gameRepo.findOne({ where: { slug } });

    if (!game) {
      game = this.gameRepo.create({ name: standardized, slug });
      game = await this.gameRepo.save(game);
    }

    return game;
  }

  async search(query: string): Promise<Game[]> {
    const standardized = standardizeName(query);
    return this.gameRepo.find({
      where: { name: ILike(`%${standardized}%`) },
      take: 20,
    });
  }

  async updateFailedStores(gameId: string, errors: { store: string; reason: string }[]) {
    await this.gameRepo.update(gameId, { failedStores: errors });
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
