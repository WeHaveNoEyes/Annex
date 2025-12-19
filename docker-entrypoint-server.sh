#!/bin/bash
set -e

# Annex Server-Only Entrypoint
# Requires external PostgreSQL via DATABASE_URL

echo "[Annex] Server-only mode"

# Verify DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "[Annex] ERROR: DATABASE_URL environment variable is required for server-only image"
  echo "[Annex] Example: DATABASE_URL=postgresql://user:password@postgres:5432/annex"
  exit 1
fi

echo "[Annex] Using external PostgreSQL: ${DATABASE_URL%%\?*}"

# Set config directory
export ANNEX_CONFIG_DIR="${ANNEX_CONFIG_DIR:-/data/config}"
mkdir -p "$ANNEX_CONFIG_DIR"

# Run database migrations
echo "[Annex] Running database migrations..."
cd /app/server
bunx prisma migrate deploy --schema=./prisma/schema.prisma

# Set port
export PORT="${PORT:-3000}"

# Handle shutdown gracefully
cleanup() {
  echo "[Annex] Shutting down..."
  exit 0
}

trap cleanup SIGTERM SIGINT

# Start server
echo "[Annex] Starting server on port ${PORT}..."
exec bun src/index.ts
