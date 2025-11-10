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
  DB_HOST="${POSTGRES_HOST:-db}"
  DB_PORT="${POSTGRES_PORT:-5432}"
  DB_USER="${POSTGRES_USER:-app}"
  DB_NAME="${POSTGRES_DB:-app}"
  if [ "$PW" != "" ]; then
    export DATABASE_URL="postgresql://${DB_USER}:${PW}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
  else
    export DATABASE_URL="postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
  fi
  log "DATABASE_URL constructed for ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
else
  log "DATABASE_URL provided"
fi

# Load common secrets from Docker secrets files if the corresponding env vars are empty.
# This allows keeping sensitive values out of .env and CI logs.
load_secret() {
  # $1 = VAR_NAME, $2 = secret file basename (optional; defaults to lowercase var name)
  VAR_NAME="$1"
  FILE_NAME="${2:-$(echo "$1" | tr 'A-Z' 'a-z')}"
  CURRENT="$(eval echo \"\${$VAR_NAME:-}\")"
  if [ -z "$CURRENT" ] && [ -f "/run/secrets/$FILE_NAME" ]; then
    VAL="$(cat "/run/secrets/$FILE_NAME")"
    export "$VAR_NAME"="$VAL"
    log "Loaded $VAR_NAME from secret /run/secrets/$FILE_NAME"
  fi
}

# NEXTAUTH_SECRET, ADMIN_PASSWORD, GEMINI_API_KEY, LEGACY_MYSQL_URL (for legacy-sync)
load_secret NEXTAUTH_SECRET nextauth_secret
load_secret ADMIN_PASSWORD admin_password
load_secret GEMINI_API_KEY gemini_api_key
load_secret LEGACY_MYSQL_URL legacy_mysql_url

# Pick Prisma CLI (prefer local binary, then JS entry, then pnpm/npx)
PRISMA_CLI=""
if [ -x "/app/node_modules/.bin/prisma" ]; then
  PRISMA_CLI="/app/node_modules/.bin/prisma"
elif [ -f "/app/node_modules/prisma/build/index.js" ]; then
  PRISMA_CLI="node /app/node_modules/prisma/build/index.js"
elif command -v prisma >/dev/null 2>&1; then
  PRISMA_CLI="prisma"
elif command -v pnpm >/dev/null 2>&1; then
  PRISMA_CLI="pnpm prisma"
elif command -v npx >/dev/null 2>&1; then
  PRISMA_CLI="npx prisma"
else
  log "Prisma CLI is not available"
  exit 1
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
  PG_HOST="${POSTGRES_HOST:-localhost}"
  PG_DB="${POSTGRES_DB:-app}"
  PG_USER="${POSTGRES_USER:-app}"
  log "Waiting for database to be ready..."
  until pg_isready -h "$PG_HOST" -d "$PG_DB" -U "$PG_USER" >/dev/null 2>&1; do
    sleep 1
  done
fi

# Optionally run migrations on container start (disabled by default)
case "${MIGRATE_ON_START:-}" in
  1|true|TRUE|yes|on)
    log "Running prisma migrate deploy"
    sh -lc "$PRISMA_CLI migrate deploy"
    ;;
  *)
    log "Skip prisma migrate deploy (MIGRATE_ON_START not set)"
    ;;
esac

if [ "${SEED_ON_START:-}" = "1" ] || [ "${SEED_ON_START:-}" = "true" ] || [ "${SEED_ON_START:-}" = "TRUE" ]; then
  log "Seeding database"
  # Do not fail container if seed script exits non-zero
  sh -lc "$PRISMA_CLI db seed || true"
fi

log "Starting app: $*"
exec "$@"
