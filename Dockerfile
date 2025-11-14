# syntax=docker/dockerfile:1.7

ARG BUILD_DATE
ARG VCS_REF
ARG VERSION=0.0.0

# ---- base: Node 20 Debian (glibc, OpenSSL 3) ----
FROM node:20-bookworm-slim AS base
ENV TZ=UTC NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

# ---- deps: install dependencies with cache ----
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ pkg-config \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy Prisma schema (folder-based schema)
COPY prisma/schema prisma/schema
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

# ---- dev: hot-reload image ----
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
RUN pnpm prisma generate
EXPOSE 3000
CMD ["pnpm","dev"]

# ---- builder: compile Next.js (standalone) ----
FROM deps AS builder
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
# Provide safe defaults for build-time env validation. Runtime secrets are loaded in the runner via entrypoint.
ARG NEXTAUTH_SECRET=builder-secret-placeholder
ARG NEXTAUTH_URL=http://localhost:3000
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET NEXTAUTH_URL=$NEXTAUTH_URL
COPY . .
RUN pnpm prisma generate \
  && pnpm build \
  && pnpm prune --prod

# ---- runner: minimal runtime, non-root, healthcheck ----
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 TZ=UTC NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# только системные сертификаты; init обеспечит compose (init: true)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
# build artifacts
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
# entrypoint for running migrations/seed on start
COPY --from=builder --chown=node:node /app/entrypoint.sh ./entrypoint.sh
# ensure it's executable before switching to non-root
RUN chmod +x /app/entrypoint.sh
# только Prisma CLI (для миграций в контейнере)
# PNPM creates symlinks into .pnpm; copy minimal tree for prisma CLI to work offline
COPY --from=deps --chown=node:node /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=deps --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps --chown=node:node /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps --chown=node:node /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
ENV PATH="/app/node_modules/.bin:${PATH}"
RUN chmod +x /app/node_modules/.bin/prisma || true
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node","-e","fetch('http://127.0.0.1:3000/api/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
LABEL org.opencontainers.image.created=$BUILD_DATE \
      org.opencontainers.image.source="https://example.com/repository" \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.title="crossnext" \
      org.opencontainers.image.description="Next.js + Prisma + Postgres"
CMD ["node","server.js"]
