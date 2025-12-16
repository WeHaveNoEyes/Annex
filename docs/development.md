# Development Setup

## Prerequisites

- Bun 1.0+
- PostgreSQL 14+
- qBittorrent (optional, for download testing)

## Clone and Install

```bash
git clone git@github.com:WeHaveNoEyes/Annex.git
cd Annex
bun install
```

## Database Setup

Create a PostgreSQL database:

```bash
sudo -u postgres createuser annex
sudo -u postgres psql -c "ALTER USER annex WITH PASSWORD 'annex';"
sudo -u postgres createdb annex -O annex
```

## Environment Configuration

Copy the example environment file:

```bash
cp packages/server/.env.example packages/server/.env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `TMDB_API_KEY` | Get from [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) |

Optional variables for full functionality:

| Variable | Description |
|----------|-------------|
| `QBITTORRENT_URL` | qBittorrent WebUI URL (default: `http://localhost:8080`) |
| `QBITTORRENT_USERNAME` | qBittorrent username |
| `QBITTORRENT_PASSWORD` | qBittorrent password |
| `OMDB_API_KEY` | For IMDB/RT/Metacritic ratings |
| `TRAKT_CLIENT_ID` | For Trakt ratings |

## Run Migrations

```bash
bun run --filter @annex/server db:migrate
```

## Start Development Servers

```bash
bun run dev
```

This starts:
- Backend: http://localhost:3000
- Frontend: http://localhost:5173

The frontend proxies API requests to the backend automatically.

## Project Structure

```
packages/
├── client/     # React frontend (Vite)
├── server/     # Bun backend (tRPC + Bun.serve)
├── encoder/    # Remote encoder package
└── shared/     # Shared TypeScript types
```

## Common Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all dev servers |
| `bun run build` | Build all packages |
| `bun run start` | Start production server |
| `bun run typecheck` | Run TypeScript checks |
| `bun run lint` | Run linting |
| `bun run clean` | Remove all build artifacts and node_modules |

## Database Commands

```bash
# Run migrations
bun run --filter @annex/server db:migrate

# Open Prisma Studio (database GUI)
bunx prisma studio --schema=packages/server/prisma/schema.prisma

# Reset database
bunx prisma migrate reset --schema=packages/server/prisma/schema.prisma

# Generate Prisma client after schema changes
bun run --filter @annex/server db:generate
```

## Troubleshooting

### Port already in use

Kill the process using the port:

```bash
# Find process on port 3000
lsof -i :3000
# Kill it
kill -9 <PID>
```

### Database connection issues

Verify PostgreSQL is running:

```bash
sudo systemctl status postgresql
```

Check connection:

```bash
psql -U annex -d annex -h localhost
```

### Prisma client out of sync

Regenerate after schema changes:

```bash
bun run --filter @annex/server db:generate
```
