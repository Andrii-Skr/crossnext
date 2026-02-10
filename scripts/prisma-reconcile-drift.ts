import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

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

function formatTsForMigration(date: Date) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function deriveShadowDatabaseUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const currentSchema = parsed.searchParams.get("schema") ?? "public";
  parsed.searchParams.set("schema", `${currentSchema}_shadow_align`);
  return parsed.toString();
}

function runPnpm(projectRoot: string, args: string[], env?: NodeJS.ProcessEnv) {
  const command = ["pnpm", ...args].join(" ");
  console.log(`> ${command}`);
  const result = spawnSync("pnpm", args, {
    cwd: projectRoot,
    env: env ?? process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command}`);
  }
}

function runPnpmCapture(projectRoot: string, args: string[], env?: NodeJS.ProcessEnv) {
  const command = ["pnpm", ...args].join(" ");
  console.log(`> ${command}`);
  const result = spawnSync("pnpm", args, {
    cwd: projectRoot,
    env: env ?? process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(stderr ? `${command}\n${stderr}` : `Command failed: ${command}`);
  }
  return typeof result.stdout === "string" ? result.stdout : "";
}

function hasMeaningfulSql(sql: string) {
  const normalized = sql
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("--"))
    .join("\n");
  return normalized.length > 0;
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

  const shadowDatabaseUrl = deriveShadowDatabaseUrl(databaseUrl);
  const envForDiff = {
    ...process.env,
    SHADOW_DATABASE_URL: shadowDatabaseUrl,
  };

  runPnpm(projectRoot, ["prisma", "--version"], envForDiff);

  const migrationName = `${formatTsForMigration(new Date())}_reconcile_drift`;
  const migrationDir = path.join(projectRoot, "prisma/schema/migrations", migrationName);
  const migrationPath = path.join(migrationDir, "migration.sql");
  const diffSql = runPnpmCapture(
    projectRoot,
    [
      "prisma",
      "migrate",
      "diff",
      "--from-migrations",
      "prisma/schema/migrations",
      "--to-url",
      databaseUrl,
      "--shadow-database-url",
      shadowDatabaseUrl,
      "--script",
    ],
    envForDiff,
  );

  if (!hasMeaningfulSql(diffSql)) {
    console.log("No drift SQL generated. History and current DB schema are already aligned.");
    return;
  }

  console.log(`Planned reconciliation migration: ${migrationName}`);
  if (dryRun) {
    console.log("Dry run: migration file was not written and resolve was not executed.");
    return;
  }

  if (!force) {
    throw new Error("Refusing to create/resolve reconciliation migration without --yes.");
  }

  fs.mkdirSync(migrationDir, { recursive: true });
  fs.writeFileSync(migrationPath, diffSql);
  console.log(`Migration file written: ${migrationPath}`);

  runPnpm(projectRoot, ["prisma", "migrate", "resolve", "--applied", migrationName], envForDiff);
  runPnpm(projectRoot, ["prisma", "migrate", "status"], envForDiff);
  console.log("Drift reconciliation migration marked as applied.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prisma-reconcile-drift failed: ${message}`);
  process.exit(1);
});
