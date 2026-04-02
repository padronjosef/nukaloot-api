import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Price } from './price.entity';

@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  logoUrl: string;

  @OneToMany(() => Price, (price) => price.store)
  prices: Price[];
}
