# Nukaloot API

Backend service that scrapes and aggregates video game prices from multiple online stores.

## Tech Stack

- NestJS 11 (TypeScript)
- PostgreSQL 16 with TypeORM
- Playwright (browser-based scraping)
- Axios + Cheerio (API/HTML scraping)

## Architecture

Internal-only service, not exposed to the internet. Only the Next.js frontend can reach it via Docker's internal network.

Scrapers:
- **Steam** -- official API via Axios
- **CheapShark** -- aggregates 20+ stores (GOG, Humble, Fanatical, GreenManGaming, Epic, etc.)
- **Eneba** -- Algolia API
- **G2A** -- REST API
- **Kinguin** -- REST API
- **CDKeys** -- browser-based scraping via Playwright
- **Instant Gaming** -- browser-based scraping via Playwright

Results are cached in PostgreSQL with a daily cache boundary at 1:00 PM COT. Stale results are re-scraped on demand.

## Getting Started

### Prerequisites

- Docker (runs via `nukaloot-infra` docker-compose)
- All 3 repos cloned as siblings in the same parent folder

### Development

```bash
# From nukaloot-infra/
docker compose up
```

API available at http://localhost:3002 (dev) or http://localhost:3000 (prod, internal only).

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USERNAME` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `DB_NAME` | `game_prices` | Database name |
| `DB_SSL` | `false` | Enable SSL for database connection |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/search?q=<query>` | Search prices (paginated, cached) |
| `GET` | `/api/search/stream?q=<query>&cc=<region>` | SSE stream with progressive results |
| `GET` | `/api/games?q=<query>` | Search games |
| `GET` | `/api/games/featured` | Featured games from Steam |
| `GET` | `/api/games/upcoming` | Upcoming and new releases from Steam |

### SSE Streaming

1. **Fast phase** (~1-2s): Steam API + CheapShark respond quickly
2. **Slow phase** (~5-15s): Instant Gaming scraped via Playwright
3. Events sent progressively: `pending`, `fast`, `slow`, `done`

### Game Type Detection

Games are classified as `game`, `dlc`, `bundle`, or `unknown` using Steam's type field and name-based inference (keywords like "bundle", "GOTY", "season pass", "deluxe edition").

## Project Structure

```
src/
  entities/          # TypeORM entities (Game, Price, Store)
  games/             # Games module (featured, upcoming, search)
  prices/            # Price caching and persistence
  scrapers/
    providers/       # Steam, CheapShark, Eneba, G2A, Kinguin, CDKeys, InstantGaming
    interfaces/      # Shared scraper interfaces
  search/            # Search orchestration and SSE streaming
  stores/            # Store definitions
```

## Testing

170 tests passing.

```bash
npm run test
```

## Deployment

GitHub Actions deploys on push to `main` via SSH to EC2. The deploy script rebuilds the Docker container.

### Pre-push Hook

Runs `lint` + `test` + `build` before every push.

## Auto-Versioning

Prefix commit messages with `[major]`, `[minor]`, or `[patch]` to auto-bump the version in package.json via GitHub Actions.

## Related Repos

| Repo | Description |
|------|-------------|
| [nukaloot-web](https://github.com/padronjosef/nukaloot-web) | Frontend (Next.js) |
| [nukaloot-infra](https://github.com/padronjosef/nukaloot-infra) | Docker Compose and infrastructure |
