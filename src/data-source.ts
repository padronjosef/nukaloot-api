import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Favourite, Game, Price, SearchLog, Store, User } from './entities';

/**
 * The CLI's view of the database, used only to generate and run migrations.
 * The app builds its own connection in app.module.ts; both read the same
 * environment, so a migration is always generated against the schema the app
 * would actually create.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'game_prices',
  entities: [Game, Store, Price, SearchLog, User, Favourite],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
