# Game Price API

Backend service that scrapes and aggregates video game prices from multiple online stores, helping users find the best deals.

## What it does

Searches across **Steam**, **CheapShark** (aggregates 20+ stores like GOG, Humble, Fanatical, GreenManGaming, Epic, etc.), and **Instant Gaming** to find and compare game prices in real time.

Results are cached in PostgreSQL and refreshed daily at 1:00 PM COT to avoid unnecessary re-scraping.

## Tech Stack

- **NestJS 11** (TypeScript)
- **PostgreSQL 16** with TypeORM
- **Playwright** for browser-based scraping (Instant Gaming)
- **Axios** for API-based scraping (Steam, CheapShark)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/search?q=<query>` | Search prices (paginated, cached) |
| `GET` | `/api/search/stream?q=<query>&cc=<region>` | SSE stream with progressive results |
| `GET` | `/api/games?q=<query>` | Search games |
| `GET` | `/api/games/featured` | Featured games from Steam |
| `GET` | `/api/games/upcoming` | Upcoming and new releases from Steam |

### How the stream works

1. **Fast phase** (~1-2s): Steam API + CheapShark API respond quickly
2. **Slow phase** (~5-15s): Instant Gaming is scraped via Playwright
3. Results are sent as SSE events (`fast`, `slow`, `done`) so the frontend can render progressively

## Game Type Detection

Games are automatically classified as `game`, `dlc`, or `bundle` using:
- Steam's own type classification
- Name-based inference for keywords like "bundle", "complete edition", "goty", "season pass", "deluxe edition", etc.

## Setup

```bash
npm install
npm run start:dev
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USERNAME` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `DB_NAME` | `game_prices` | Database name |

## Related Repos

This project is part of a multi-repo setup. All three repos are needed to run the full stack:

| Repo | Description |
|------|-------------|
| **game-price-api** (this repo) | Backend API |
| [game-price-web](https://github.com/padronjosef/game-price-web) | Frontend (Next.js) |
| [game-price-infra](https://github.com/padronjosef/game-price-infra) | Docker Compose and infrastructure |

> The easiest way to get everything running is via Docker Compose in the [infra repo](https://github.com/padronjosef/game-price-infra). Clone all three repos as siblings and run `docker compose up` from `game-price-infra/`.

## Project Structure

```
src/
  entities/          # TypeORM entities (Game, Price, Store)
  games/             # Games module (featured, upcoming, search)
  prices/            # Price caching and persistence
  scrapers/
    providers/       # Steam, CheapShark, InstantGaming
    interfaces/      # Shared scraper interfaces
  search/            # Search orchestration and SSE streaming
```
