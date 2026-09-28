import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Game } from './game.entity';
import { User } from './user.entity';

export const FAVOURITE_SOURCES = ['manual', 'steam'] as const;
export type FavouriteSource = (typeof FAVOURITE_SOURCES)[number];

/**
 * A game somebody wants to keep an eye on. The pair is the key, so saving the
 * same game twice is impossible rather than merely discouraged.
 *
 * The tracker reads the distinct games across every row here: a thousand
 * people watching one game is still one scrape.
 */
@Entity('favourites')
export class Favourite {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @Index()
  @PrimaryColumn({ type: 'uuid' })
  gameId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Game, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gameId' })
  game: Game;

  /**
   * Where it came from. A Steam row is a mirror of the wishlist and the sync
   * owns it; a manual one is owned by the person who saved it.
   */
  @Column({ type: 'varchar', length: 16, default: 'manual' })
  source: FavouriteSource;

  /**
   * Whether it feeds the tracker and its alerts. Storing a game is free;
   * watching it costs a scrape, so the cap belongs on this rather than on how
   * many games the list holds — which is what lets a 500-game wishlist in.
   */
  @Column({ default: true })
  tracked: boolean;

  /**
   * Which platforms to price this one game on, overriding the account setting.
   * Null — the normal case — means follow the account. Somebody may own a PC
   * and a Switch and want only the Switch price for one particular game.
   */
  @Column({ type: 'simple-array', nullable: true })
  platforms: string[] | null;

  /** Where the price stood when it was saved, for "cheaper than when you added it". */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceWhenAdded: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
