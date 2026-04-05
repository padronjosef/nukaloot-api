import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Game } from './game.entity';
import { Store } from './store.entity';

@Entity('prices')
export class Price {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  originalPrice: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column()
  productUrl: string;

  @Column()
  gameName: string;

  @Column({ default: 'other' })
  gameType: string;

  @Column({ default: '' })
  imageUrl: string;

  @Column({ default: '' })
  backgroundUrl: string;

  @Column({ default: '' })
  releaseDate: string;

  @CreateDateColumn()
  scrapedAt: Date;

  @ManyToOne(() => Game, (game) => game.prices, { onDelete: 'CASCADE' })
  game: Game;

  @ManyToOne(() => Store, (store) => store.prices, { onDelete: 'CASCADE' })
  store: Store;
}
