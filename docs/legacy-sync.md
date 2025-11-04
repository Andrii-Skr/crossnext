Legacy sync service

Purpose
- Periodically export rows from Postgres views `legacy_export.word_v` and `legacy_export.opred_v` into the legacy MySQL tables `word_v` and `opred_v`.
- Runs as a standalone Node/TS script or as a dev Compose service.
- Atomic swap via temp tables to avoid partial reads.

Environment
- `DATABASE_URL` – Postgres DSN (used by Prisma)
- `LEGACY_MYSQL_URL` – MySQL DSN (target legacy DB)
- `LEGACY_EXPORT_SCHEMA` – schema in PG with export views (default `legacy_export`)
- `SYNC_CRON` – optional cron expression; if not set, schedule is derived from `SYNK_TEST` (or runs once when `RUN_ONCE=true`)
- `SYNK_TEST` – when `true` runs every minute; when `false` runs daily at 03:00 (applies only when `SYNC_CRON` is not set)
- `RUN_ONCE` – force one-off run even if `SYNK_TEST` is set
- `SYNC_BATCH_SIZE` – optional batch size for inserts (default 1000)
- `LOG_LEVEL` – debug|info|warn|error (default info)

Run locally (one-off)
- `pnpm sync:legacy:once`

Run with schedule (every hour example)
- `SYNC_CRON="0 * * * *" pnpm sync:legacy:once`

Test mode schedule
- `SYNK_TEST=true pnpm sync:legacy:once` → every 10 minutes
- `SYNK_TEST=false pnpm sync:legacy:once` → daily at 03:00
Note: overlapping runs are skipped if a previous sync is still running.

Compose (dev)
- Start dependencies: `docker compose --profile dev --profile mysql up -d db-dev mysql-dev`
- Run sync as service: `docker compose --profile dev --profile mysql --profile sync up legacy-sync-dev`

Safety notes
- The script creates `word_v_new` / `opred_v_new`, fills them, atomically renames both and drops the old tables.
- Requires existing base tables `word_v` and `opred_v` in MySQL (structure is copied via `CREATE TABLE ... LIKE`).
- Ensure MySQL user has privileges to CREATE, DROP, and RENAME tables.
