#!/usr/bin/env bash
set -euo pipefail

# Simple production deploy/update helper for this repo.
# Usage examples:
#   BRANCH=main ./scripts/deploy-prod.sh
#   SEED=1 PRUNE=1 ./scripts/deploy-prod.sh
#   HEALTH_URL=http://127.0.0.1:8080/api/healthz ./scripts/deploy-prod.sh
#   # cross is expected at ../cross; branch is auto-detected, can be overridden:
#   CROSS_BRANCH=main ./scripts/deploy-prod.sh
#   # First-time bootstrap (no .git here):
#   GIT_URL=git@github.com:org/repo.git BRANCH=main ./scripts/deploy-prod.sh

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PROFILE=prod
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
REMOTE="${GIT_REMOTE:-origin}"
SEED="${SEED:-0}"
PRUNE="${PRUNE:-0}"
RUN_MIGRATIONS="${MIGRATE:-0}"
CROSS_DIR="../cross"
CROSS_BRANCH="${CROSS_BRANCH:-}"
CROSS_REMOTE="${CROSS_GIT_REMOTE:-origin}"

# Read APP_PORT from .env (fallback 3000)
APP_PORT_ENV="$(awk -F= '/^APP_PORT[[:space:]]*=/{print $2}' .env 2>/dev/null | tr -d '"' | tr -d "'" | head -n1 || true)"
APP_PORT="${APP_PORT:-${APP_PORT_ENV:-3000}}"
## Read CROSS_PORT from .env (fallback 3001)
CROSS_PORT_ENV="$(awk -F= '/^CROSS_PORT[[:space:]]*=/{print $2}' .env 2>/dev/null | tr -d '"' | tr -d "'" | head -n1 || true)"
CROSS_PORT="${CROSS_PORT:-${CROSS_PORT_ENV:-3001}}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${APP_PORT}/api/healthz}"
CROSS_HEALTH_URL="${CROSS_HEALTH_URL:-http://127.0.0.1:${CROSS_PORT}/api/healthz}"

echo "📦 Repo dir: $PWD | Branch: $BRANCH | Profile: $PROFILE"

# Bootstrap repo if this directory is not a Git work tree
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [[ -z "${GIT_URL:-}" ]]; then
    echo "❌ Not a Git repository and GIT_URL is not set."
    echo "   Set GIT_URL=git@github.com:org/repo.git (or HTTPS URL) and re-run."
    exit 1
  fi
  echo "🔧 Bootstrapping Git repo from $GIT_URL (branch: $BRANCH, remote: $REMOTE) ..."
  git -c init.defaultBranch="$BRANCH" init
  if git remote | grep -q "^$REMOTE$"; then
    git remote set-url "$REMOTE" "$GIT_URL"
  else
    git remote add "$REMOTE" "$GIT_URL"
  fi
  git fetch --prune "$REMOTE"
  # Create/reset local branch to remote state
  git checkout -B "$BRANCH" "$REMOTE/$BRANCH" || {
    git fetch "$REMOTE" "$BRANCH"
    git checkout -B "$BRANCH" "$REMOTE/$BRANCH"
  }
fi

echo "📥 Syncing code from Git ($REMOTE/$BRANCH)..."
git fetch --all --prune
git checkout "$BRANCH"
git pull --ff-only "$REMOTE" "$BRANCH"

if [[ -d "$CROSS_DIR/.git" ]]; then
  git -C "$CROSS_DIR" fetch --all --prune

  RESOLVED_CROSS_BRANCH="$CROSS_BRANCH"
  if [[ -z "$RESOLVED_CROSS_BRANCH" ]]; then
    if git -C "$CROSS_DIR" show-ref --verify --quiet "refs/remotes/$CROSS_REMOTE/$BRANCH"; then
      RESOLVED_CROSS_BRANCH="$BRANCH"
    elif git -C "$CROSS_DIR" show-ref --verify --quiet "refs/remotes/$CROSS_REMOTE/main"; then
      RESOLVED_CROSS_BRANCH="main"
    elif git -C "$CROSS_DIR" show-ref --verify --quiet "refs/remotes/$CROSS_REMOTE/master"; then
      RESOLVED_CROSS_BRANCH="master"
    else
      RESOLVED_CROSS_BRANCH="$(git -C "$CROSS_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    fi
  fi
  if [[ -z "$RESOLVED_CROSS_BRANCH" || "$RESOLVED_CROSS_BRANCH" == "HEAD" ]]; then
    echo "❌ Unable to resolve cross branch. Set CROSS_BRANCH explicitly."
    exit 1
  fi

  echo "📥 Syncing cross repo ($CROSS_DIR) from Git ($CROSS_REMOTE/$RESOLVED_CROSS_BRANCH)..."
  git -C "$CROSS_DIR" fetch --all --prune
  git -C "$CROSS_DIR" checkout "$RESOLVED_CROSS_BRANCH" || {
    git -C "$CROSS_DIR" fetch "$CROSS_REMOTE" "$RESOLVED_CROSS_BRANCH"
    git -C "$CROSS_DIR" checkout -B "$RESOLVED_CROSS_BRANCH" "$CROSS_REMOTE/$RESOLVED_CROSS_BRANCH"
  }
  git -C "$CROSS_DIR" pull --ff-only "$CROSS_REMOTE" "$RESOLVED_CROSS_BRANCH"
elif [[ -n "${CROSS_GIT_URL:-}" ]]; then
  if [[ -n "$CROSS_BRANCH" ]]; then
    echo "🔧 Cross repo not found. Cloning $CROSS_GIT_URL into $CROSS_DIR (branch: $CROSS_BRANCH)..."
    git clone --branch "$CROSS_BRANCH" "$CROSS_GIT_URL" "$CROSS_DIR"
  else
    echo "🔧 Cross repo not found. Cloning $CROSS_GIT_URL into $CROSS_DIR (default branch)..."
    git clone "$CROSS_GIT_URL" "$CROSS_DIR"
  fi
else
  echo "❌ Cross repo not found at: $CROSS_DIR"
  echo "   Clone it manually or set CROSS_GIT_URL and rerun deploy."
  exit 1
fi

echo "🏗️ Building Docker images (profile=$PROFILE)..."
make build PROFILE="$PROFILE"

echo "🚀 Starting/Updating services (profile=$PROFILE)..."
make up PROFILE="$PROFILE"

echo "⏳ Waiting for Postgres to be healthy..."
make pg-wait PROFILE="$PROFILE"

if [[ "$RUN_MIGRATIONS" == "1" || "$RUN_MIGRATIONS" == "true" || "$RUN_MIGRATIONS" == "TRUE" ]]; then
  echo "🧩 Applying migrations (prisma migrate deploy)..."
  make migrate PROFILE="$PROFILE"
else
  echo "⏭️  Skipping migrations (MIGRATE=$RUN_MIGRATIONS)"
fi

if [[ "$SEED" == "1" || "$SEED" == "true" || "$SEED" == "TRUE" ]]; then
  echo "🌱 Seeding database..."
  make seed PROFILE="$PROFILE" || true
fi

echo "🩺 App health check: $HEALTH_URL"
ATTEMPTS=0
until curl -fsS "$HEALTH_URL" >/dev/null; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [[ $ATTEMPTS -gt 60 ]]; then
    echo "❌ Health check failed after 60s. Recent logs:" >&2
    docker compose --profile "$PROFILE" logs --tail 120 app cross db || true
    exit 1
  fi
  sleep 1
done
echo "✅ App health OK"

echo "🩺 Cross health check: $CROSS_HEALTH_URL"
ATTEMPTS=0
until curl -fsS "$CROSS_HEALTH_URL" >/dev/null; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [[ $ATTEMPTS -gt 60 ]]; then
    echo "❌ Cross health check failed after 60s. Recent logs:" >&2
    docker compose --profile "$PROFILE" logs --tail 120 cross app db || true
    exit 1
  fi
  sleep 1
done
echo "✅ Cross health OK"

if [[ "$PRUNE" == "1" || "$PRUNE" == "true" || "$PRUNE" == "TRUE" ]]; then
  echo "🧹 Cleaning up unused Docker resources..."
  docker system prune -af --volumes || true
fi

echo "🎉 Deployment complete. App is up on port ${APP_PORT}."
