import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

function loadEnv(projectRoot: string) {
  const envPath = path.join(projectRoot, ".env");
  const envLocalPath = path.join(projectRoot, ".env.local");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: true });
  }
}

function getLocalMigrationNames(projectRoot: string) {
  const migrationsDir = path.join(projectRoot, "prisma/schema/migrations");
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "migration_lock.toml")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function runPnpm(projectRoot: string, args: string[]) {
  const command = ["pnpm", ...args].join(" ");
  console.log(`> ${command}`);
  const result = spawnSync("pnpm", args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command}`);
  }
}

async function main() {
  const projectRoot = process.cwd();
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const force = args.has("--yes");

  loadEnv(projectRoot);

  const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_DEV;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DATABASE_URL_DEV must be set.");
  }

  const localMigrations = getLocalMigrationNames(projectRoot);
  if (localMigrations.length === 0) {
    throw new Error("No local migrations found in prisma/schema/migrations.");
  }

  if (!dryRun) {
    runPnpm(projectRoot, ["prisma", "--version"]);
  }

  console.log(`Found ${localMigrations.length} local migrations.`);
  for (const migration of localMigrations) {
    console.log(`- ${migration}`);
  }

  const backupDir = path.join(projectRoot, "var/prisma-migrations-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupName = new Date().toISOString().replaceAll(":", "-");
  const backupPath = path.join(backupDir, `${backupName}.json`);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const existing = await client.query(
      'SELECT id, checksum, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at ASC NULLS LAST, migration_name ASC',
    );

    fs.writeFileSync(backupPath, `${JSON.stringify(existing.rows, null, 2)}\n`);
    console.log(`Backup written: ${backupPath}`);

    if (dryRun) {
      console.log("Dry run: no DB changes were applied.");
      return;
    }

    if (!force) {
      throw new Error("Refusing to modify _prisma_migrations without --yes.");
    }

    await client.query('TRUNCATE TABLE "_prisma_migrations"');
    console.log('Truncated table "_prisma_migrations".');
  } finally {
    await client.end();
  }

  for (const migration of localMigrations) {
    runPnpm(projectRoot, ["prisma", "migrate", "resolve", "--applied", migration]);
  }

  runPnpm(projectRoot, ["prisma", "migrate", "status"]);
  console.log("History alignment completed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prisma-align-history failed: ${message}`);
  process.exit(1);
});
