import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('search_logs')
@Index(['createdAt'])
@Index(['normalizedQuery'])
@Index(['country'])
export class SearchLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Exactly what the visitor typed. */
  @Column()
  query: string;

  /** Lowercased and collapsed, used to group the same search together. */
  @Column()
  normalizedQuery: string;

  @Column({ length: 45, nullable: true, type: 'varchar' })
  ip: string | null;

  /** ISO 3166-1 alpha-2, from Cloudflare or the geo fallback. */
  @Column({ length: 2, nullable: true, type: 'varchar' })
  country: string | null;

  @Column({ nullable: true, type: 'varchar' })
  city: string | null;

  @Column({ nullable: true, type: 'varchar' })
  region: string | null;

  /** Currency region the visitor had selected when searching. */
  @Column({ length: 8, nullable: true, type: 'varchar' })
  currencyRegion: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'text', nullable: true })
  referer: string | null;

  @Column({ default: false })
  isBot: boolean;

  @Column({ default: false })
  cacheHit: boolean;

  @Column({ type: 'int', default: 0 })
  resultCount: number;

  /** Stable per visitor (hash of IP + user agent), so counting people needs no cookie. */
  @Index()
  @Column({ length: 32, nullable: true, type: 'varchar' })
  visitorId: string | null;

  /**
   * The signed-in account, when there was one. Deliberately not a foreign key:
   * deleting someone should not rewrite history, and the email is read back by
   * joining at query time so it is never a stale copy.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
