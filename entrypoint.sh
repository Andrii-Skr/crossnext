#!/usr/bin/env sh
set -eu

log() { echo "[entrypoint] $*"; }

# Compose DATABASE_URL if not provided (prod compose passes POSTGRES_* and a secret file)
if [ "${DATABASE_URL:-}" = "" ]; then
  PW="${POSTGRES_PASSWORD:-}"
  if [ "$PW" = "" ] && [ -n "${POSTGRES_PASSWORD_FILE:-}" ] && [ -f "$POSTGRES_PASSWORD_FILE" ]; then
    PW="$(cat "$POSTGRES_PASSWORD_FILE")"
  elif [ "$PW" = "" ] && [ -f "/run/secrets/postgres_password" ]; then
    PW="$(cat /run/secrets/postgres_password)"
  fi
  HOST="${POSTGRES_HOST:-db}"
  PORT="${POSTGRES_PORT:-5432}"
  USER="${POSTGRES_USER:-app}"
  DB="${POSTGRES_DB:-app}"
  if [ "$PW" != "" ]; then
    export DATABASE_URL="postgresql://${USER}:${PW}@${HOST}:${PORT}/${DB}?schema=public"
  else
    export DATABASE_URL="postgresql://${USER}@${HOST}:${PORT}/${DB}?schema=public"
  fi
  log "DATABASE_URL constructed for ${USER}@${HOST}:${PORT}/${DB}"
else
  log "DATABASE_URL provided"
fi

# Pick Prisma CLI
PRISMA_CLI="prisma"
if ! command -v prisma >/dev/null 2>&1; then
  if command -v pnpm >/dev/null 2>&1; then
    PRISMA_CLI="pnpm prisma"
  elif command -v npx >/dev/null 2>&1; then
    PRISMA_CLI="npx prisma"
  else
    log "Prisma CLI is not available"
    exit 1
  fi
fi

# In dev containers with bind mounts, node_modules may be empty volume; install if needed
if command -v pnpm >/dev/null 2>&1; then
  if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null || true)" ]; then
    log "Installing dependencies (pnpm install)"
    pnpm install --frozen-lockfile || pnpm install
  fi
fi

# If pg_isready is available, wait for DB readiness (compose also has healthchecks)
if command -v pg_isready >/dev/null 2>&1; then
  HOST="${POSTGRES_HOST:-localhost}"
  DB="${POSTGRES_DB:-app}"
  USER="${POSTGRES_USER:-app}"
  log "Waiting for database to be ready..."
  until pg_isready -h "$HOST" -d "$DB" -U "$USER" >/dev/null 2>&1; do
    sleep 1
  done
fi

log "Running prisma migrate deploy"
sh -lc "$PRISMA_CLI migrate deploy"

if [ "${SEED_ON_START:-}" = "1" ] || [ "${SEED_ON_START:-}" = "true" ] || [ "${SEED_ON_START:-}" = "TRUE" ]; then
  log "Seeding database"
  # Do not fail container if seed script exits non-zero
  sh -lc "$PRISMA_CLI db seed || true"
fi

log "Starting app: $*"
exec "$@"
