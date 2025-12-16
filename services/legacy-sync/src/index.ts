import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection, PoolOptions } from "mysql2/promise";
import mysql from "mysql2/promise";
import { Pool as PgPool } from "pg";
import { z } from "zod";

// Optional dependency: node-cron. Loaded lazily to avoid runtime dep when SYNC_CRON not set.
type CronModule = typeof import("node-cron");

const toBool = (v?: string) => typeof v === "string" && /^(1|true|yes|y|on)$/i.test(v.trim());

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  LEGACY_MYSQL_URL: z.string().url(),
  LEGACY_EXPORT_SCHEMA: z
    .string()
    .default("legacy_export")
    .transform((v) => v.trim())
    .refine((v) => /^[A-Za-z0-9_]+$/.test(v), {
      message: "LEGACY_EXPORT_SCHEMA must contain only letters, digits or underscore",
    }),
  SYNC_BATCH_SIZE: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 10000))
    .pipe(z.number().int().positive()),
  SYNC_BATCH_SIZE_WORDS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  SYNC_BATCH_SIZE_OPREDS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  SYNC_LIMIT_WORDS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  SYNC_LIMIT_OPREDS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  SYNC_MODE: z.enum(["full"]).default("full"),
  SYNC_CRON: z.string().optional(), // if absent -> run once and exit
  SYNK_TEST: z
    .string()
    .optional()
    .transform((v) => (v ? toBool(v) : false))
    .pipe(z.boolean()),
  RUN_ONCE: z
    .string()
    .optional()
    .transform((v) => (v ? toBool(v) : false))
    .pipe(z.boolean()),
  PG_STATEMENT_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 0))
    .pipe(z.number().int().min(0)),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // Управление ускорением загрузки opred_v (MyISAM):
  // при true удаляем FULLTEXT индексы на время bulk-вставки и создаём их после
  SYNC_OPREDS_DROP_FULLTEXT: z
    .string()
    .optional()
    .transform((v) => (v ? toBool(v) : true))
    .pipe(z.boolean()),
});

// Load env with different precedence for local vs container runs
const shellSnapshot = { ...process.env } as Record<string, string | undefined>;
const cwd = process.cwd();
const envPath = path.join(cwd, ".env");
const envLocalPath = path.join(cwd, ".env.local");
const isInContainer = fs.existsSync("/.dockerenv");
// Always load .env if present
if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
// Only load .env.local for local runs (not inside container)
if (!isInContainer && fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath, override: true });
// For local runs, give .env.local precedence for selected keys, even if shell had them set.
const localPriorityKeys = new Set([
  "SYNK_TEST",
  "SYNC_BATCH_SIZE",
  "SYNC_BATCH_SIZE_WORDS",
  "SYNC_BATCH_SIZE_OPREDS",
  "LOG_LEVEL",
]);
for (const [k, v] of Object.entries(shellSnapshot)) {
  if (typeof v === "undefined") continue;
  if (!isInContainer && localPriorityKeys.has(k)) continue; // respect .env.local for these keys locally
  process.env[k] = v;
}

const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (e) {
    logError(
      "Отсутствуют обязательные переменные окружения. Укажите DATABASE_URL (Postgres) и LEGACY_MYSQL_URL (MySQL).\n" +
        "Добавьте их в .env.local или передайте в окружении. Примеры см. в .env.example или docs/legacy-sync.md",
      e,
    );
    process.exit(1);
  }
};

const env = parseEnv();

const pgPool = new PgPool({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pgPool),
});

// Print effective config at info level to aid troubleshooting
const envSource = isInContainer ? "container:.env" : "local:.env.local>.env";
logInfo(
  `sync-config: source=${envSource}, LOG_LEVEL=${env.LOG_LEVEL}, SYNC_BATCH_SIZE=${env.SYNC_BATCH_SIZE}, ` +
    `SYNC_BATCH_SIZE_WORDS=${env.SYNC_BATCH_SIZE_WORDS ?? "-"}, SYNC_BATCH_SIZE_OPREDS=${
      env.SYNC_BATCH_SIZE_OPREDS ?? "-"
    }, ` +
    `SYNC_OPREDS_DROP_FULLTEXT=${env.SYNC_OPREDS_DROP_FULLTEXT}`,
);

async function createMySqlPool(): Promise<Pool> {
  const config: PoolOptions = {
    uri: env.LEGACY_MYSQL_URL,
    // Enable multi statements for setup/cleanup convenience
    multipleStatements: true,
    // Ensure text encoding for cp1251 tables is handled by the driver
    charset: "cp1251_general_ci",
    connectionLimit: 2,
    // Avoid timezone surprises; pass dates as JS Date objects or ISO strings
    supportBigNumbers: true,
    bigNumberStrings: true,
  };
  return mysql.createPool(config);
}

type WordRow = {
  id: string | number; // bigint
  word_text: string;
  full_text: string;
  cound: number; // smallint
  lang: string; // char(1)
  file_id: string | number; // bigint
  user_add: string;
  add_data: string | Date | null; // date
  using: number; // tinyint
  korny: string;
  data_set: string | Date | null; // date
  user_set: string;
  go_flag: number; // tinyint
};

type OpredRow = {
  id: string | number; // bigint
  word_id: string | number; // bigint
  text_opr: string;
  count_char: number; // int
  end_date: string | Date | null; // date
  lang: string; // char(1)
  tema: string | number; // bigint
  livel: number; // tinyint
  id_file: string | number; // bigint
  use: number; // tinyint
  user_add: string;
  add_data: string | Date | null; // date
  edit_user: string;
  edit_data: string | Date | null; // date
  coment: string;
  set_reg: number; // int
  data_set: string | Date | null; // date
  user_set: string;
  go_flag: number; // tinyint
};

const WORD_COLUMNS = [
  "id",
  "word_text",
  "full_text",
  "cound",
  "lang",
  "file_id",
  "user_add",
  "add_data",
  "using",
  "korny",
  "data_set",
  "user_set",
  "go_flag",
] as const;

const OPRED_COLUMNS = [
  "id",
  "word_id",
  "text_opr",
  "count_char",
  "end_date",
  "lang",
  "tema",
  "livel",
  "id_file",
  "use",
  "user_add",
  "add_data",
  "edit_user",
  "edit_data",
  "coment",
  "set_reg",
  "data_set",
  "user_set",
  "go_flag",
] as const;

function logInfo(msg: string) {
  if (env.LOG_LEVEL === "debug" || env.LOG_LEVEL === "info") console.log(msg);
}
function logDebug(msg: string) {
  if (env.LOG_LEVEL === "debug") console.debug(msg);
}
function logWarn(msg: string) {
  if (["debug", "info", "warn"].includes(env.LOG_LEVEL)) console.warn(msg);
}
function logError(msg: string, err?: unknown) {
  console.error(msg);
  if (err) console.error(err);
}

function toDateOnly(v: string | Date | null | undefined, zeroIfEmpty = false): string {
  if (v == null) return zeroIfEmpty ? "0000-00-00" : "0000-00-00";
  const s = typeof v === "string" ? v : v.toISOString();
  return s.slice(0, 10);
}

function normalizeWord(rows: WordRow[]): ReadonlyArray<Record<string, unknown>> {
  return rows.map((r) => ({
    ...r,
    // Coerce DATE columns to 'YYYY-MM-DD' or zero-date
    add_data: toDateOnly(r.add_data, true),
    data_set: toDateOnly(r.data_set, true),
  }));
}

function normalizeOpred(rows: OpredRow[]): ReadonlyArray<Record<string, unknown>> {
  return rows.map((r) => ({
    ...r,
    end_date: toDateOnly(r.end_date, true),
    add_data: toDateOnly(r.add_data, true),
    edit_data: toDateOnly(r.edit_data, true),
    data_set: toDateOnly(r.data_set, true),
  }));
}

async function ensureBaseTables(conn: PoolConnection) {
  interface TableRow extends RowDataPacket {
    TABLE_NAME: string;
  }
  const [rows] = await conn.query<TableRow[]>(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('word_v','opred_v')",
  );
  const existing = new Set(rows.map((r) => r.TABLE_NAME));
  if (!existing.has("word_v") || !existing.has("opred_v")) {
    throw new Error(
      "В MySQL не найдены базовые таблицы word_v/opred_v. Создайте их заранее (как в легаси) и запустите синк повторно.",
    );
  }
}

function buildBulkInsert(
  table: string,
  columns: readonly string[],
  batch: ReadonlyArray<Record<string, unknown>>,
): { sql: string; params: unknown[] } {
  const cols = columns.map((c) => `\`${c}\``).join(", ");
  const placeholders = batch.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
  const sql = `INSERT INTO \`${table}\` (${cols}) VALUES ${placeholders}`;
  const params: unknown[] = [];
  for (const row of batch) {
    for (const c of columns) params.push((row as Record<string, unknown>)[c]);
  }
  return { sql, params };
}

async function loadWordsToTemp(conn: PoolConnection, schema: string, batchSize: number) {
  logInfo("Создание word_v_new...");
  await conn.query("DROP TABLE IF EXISTS `word_v_new`");
  await conn.query("CREATE TABLE `word_v_new` LIKE `word_v`");
  // Speed up bulk load for MyISAM by delaying index rebuild
  await conn.query("ALTER TABLE `word_v_new` DISABLE KEYS");

  const effBatch = env.SYNC_BATCH_SIZE_WORDS ?? batchSize;
  const limitCap = env.SYNC_LIMIT_WORDS ?? Number.POSITIVE_INFINITY;
  let _fetchedTotal = 0;
  let lastId: number | null = null;
  let total = 0;
  for (;;) {
    const where = lastId == null ? "" : `WHERE "id" > ${lastId}`;
    const sql = `SELECT ${WORD_COLUMNS.map((c) => `"${c}"`).join(", ")} FROM "${schema}"."word_v" ${where} ORDER BY "id" ASC LIMIT ${effBatch}`;
    const t0 = Date.now();
    const rows = (await execPgWithTimeout<WordRow[]>(sql)) as WordRow[];
    const dt = Date.now() - t0;
    logDebug(`word_v: получено ${rows.length} строк из PG за ${dt}ms (lastId=${lastId ?? "-"})`);
    if (!rows.length) break;
    const { sql: ins, params } = buildBulkInsert("word_v_new", WORD_COLUMNS, normalizeWord(rows));
    await conn.query(ins, params);
    total += rows.length;
    _fetchedTotal += rows.length;
    lastId = Number(rows[rows.length - 1].id);
    if (total >= limitCap) break;
    logDebug(`word_v: вставлено ${rows.length}, всего ${total} (lastId=${lastId})`);
  }
  logInfo(`word_v_new заполнена (${total} строк)`);
  await conn.query("ALTER TABLE `word_v_new` ENABLE KEYS");
}

async function loadOpredsToTemp(conn: PoolConnection, schema: string, batchSize: number) {
  logInfo("Создание opred_v_new...");
  await conn.query("DROP TABLE IF EXISTS `opred_v_new`");
  await conn.query("CREATE TABLE `opred_v_new` LIKE `opred_v`");
  if (env.SYNC_OPREDS_DROP_FULLTEXT) {
    try {
      const t0 = Date.now();
      await conn.query(
        "ALTER TABLE `opred_v_new` DROP INDEX `text_opr`, DROP INDEX `user_add`, DROP INDEX `edit_user`",
      );
      logDebug(`opred_v_new: FULLTEXT индексы удалены за ${Date.now() - t0}ms`);
    } catch (e) {
      logWarn("Не удалось удалить FULLTEXT индексы у opred_v_new (продолжаем)");
      logDebug(String(e));
    }
  }
  await conn.query("ALTER TABLE `opred_v_new` DISABLE KEYS");

  const effBatch = env.SYNC_BATCH_SIZE_OPREDS ?? batchSize;
  const limitCap = env.SYNC_LIMIT_OPREDS ?? Number.POSITIVE_INFINITY;
  let lastId: number | null = null;
  let total = 0;
  for (;;) {
    const where = lastId == null ? "" : `WHERE "id" > ${lastId}`;
    const sql = `SELECT ${OPRED_COLUMNS.map((c) => `"${c}"`).join(", ")} FROM "${schema}"."opred_v" ${where} ORDER BY "id" ASC LIMIT ${effBatch}`;
    const t0 = Date.now();
    const rows = (await execPgWithTimeout<OpredRow[]>(sql)) as OpredRow[];
    const dt = Date.now() - t0;
    logDebug(`opred_v: получено ${rows.length} строк из PG за ${dt}ms (lastId=${lastId ?? "-"})`);
    if (!rows.length) break;
    const { sql: ins, params } = buildBulkInsert("opred_v_new", OPRED_COLUMNS, normalizeOpred(rows));
    const tIns0 = Date.now();
    await conn.query(ins, params);
    logDebug(`opred_v: вставка пакета ${rows.length} строк заняла ${Date.now() - tIns0}ms`);
    total += rows.length;
    lastId = Number(rows[rows.length - 1].id);
    if (total >= limitCap) break;
    logDebug(`opred_v: вставлено ${rows.length}, всего ${total} (lastId=${lastId})`);
  }
  logInfo(`opred_v_new заполнена (${total} строк)`);
  const tEnable0 = Date.now();
  await conn.query("ALTER TABLE `opred_v_new` ENABLE KEYS");
  logDebug(`opred_v_new: ENABLE KEYS завершён за ${Date.now() - tEnable0}ms`);

  if (env.SYNC_OPREDS_DROP_FULLTEXT) {
    const tFt0 = Date.now();
    await conn.query(
      "ALTER TABLE `opred_v_new` ADD FULLTEXT KEY `text_opr` (`text_opr`), ADD FULLTEXT KEY `user_add` (`user_add`), ADD FULLTEXT KEY `edit_user` (`edit_user`)",
    );
    logDebug(`opred_v_new: FULLTEXT индексы созданы за ${Date.now() - tFt0}ms`);
  }
}

async function atomicSwap(conn: PoolConnection) {
  logInfo("Атомарная замена таблиц...");
  // Single RENAME TABLE statement is atomic across multiple renames
  await conn.query(
    "RENAME TABLE `word_v` TO `word_v_old`, `word_v_new` TO `word_v`, `opred_v` TO `opred_v_old`, `opred_v_new` TO `opred_v`",
  );
  // Cleanup old tables
  await conn.query("DROP TABLE IF EXISTS `word_v_old`, `opred_v_old`");
}

async function relaxSqlMode(conn: PoolConnection) {
  // Remove NO_ZERO_DATE and NO_ZERO_IN_DATE to allow '0000-00-00' defaults/values found in legacy schema
  // Do not silently change global mode; only session.
  await conn.query("SET SESSION sql_mode = REPLACE(REPLACE(@@sql_mode,'NO_ZERO_DATE',''),'NO_ZERO_IN_DATE','')");
  interface ModeRow extends RowDataPacket {
    mode: string | null;
  }
  const [modes] = await conn.query<ModeRow[]>("SELECT @@session.sql_mode AS mode");
  const mode = Array.isArray(modes) && modes.length ? (modes[0].mode ?? undefined) : undefined;
  logDebug(`SQL_MODE(session): ${mode}`);
}

async function syncOnce(): Promise<void> {
  const pool = await createMySqlPool();
  try {
    const conn = await pool.getConnection();
    try {
      await relaxSqlMode(conn);
      await ensureBaseTables(conn);
      // Load new tables in order: words first (FK consumers may rely on ids)
      await loadWordsToTemp(conn, env.LEGACY_EXPORT_SCHEMA, env.SYNC_BATCH_SIZE);
      await loadOpredsToTemp(conn, env.LEGACY_EXPORT_SCHEMA, env.SYNC_BATCH_SIZE);
      await atomicSwap(conn);
      logInfo("Синхронизация завершена успешно.");
    } finally {
      conn.release();
    }
  } finally {
    await pool.end();
  }
}

async function execPgWithTimeout<T = unknown>(sql: string): Promise<T> {
  if (env.PG_STATEMENT_TIMEOUT_MS && env.PG_STATEMENT_TIMEOUT_MS > 0) {
    const res = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${env.PG_STATEMENT_TIMEOUT_MS}`);
      const rows = await tx.$queryRawUnsafe(sql);
      return rows as T;
    });
    return res;
  }
  return (await prisma.$queryRawUnsafe(sql)) as T;
}

async function main() {
  if (env.RUN_ONCE) {
    await syncOnce();
    await prisma.$disconnect();
    return;
  }

  // Default schedule: test mode => every 5 minutes; else daily at 03:00
  const derivedCron = env.SYNC_CRON ?? (env.SYNK_TEST ? "*/5 * * * *" : "0 3 * * *");
  if (derivedCron) {
    let cron: CronModule | null = null;
    try {
      cron = await import("node-cron");
    } catch (e) {
      logError(
        "Установите зависимость 'node-cron' или уберите SYNC_CRON, чтобы запускать синхронизацию один раз и выйти.",
        e,
      );
      process.exit(1);
    }
    logInfo(`Расписание включено: ${derivedCron}${env.SYNK_TEST ? " (test mode)" : ""}`);
    let running = false;
    const task = cron.schedule(derivedCron, async () => {
      if (running) {
        logWarn("Предыдущий запуск ещё идёт — пропускаю текущий тик.");
        return;
      }
      running = true;
      try {
        await syncOnce();
      } catch (e) {
        logError("Ошибка синхронизации", e);
      } finally {
        running = false;
      }
    });
    // Graceful shutdown
    const stop = async () => {
      logWarn("Остановка по сигналу...");
      task.stop();
      await prisma.$disconnect();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } else {
    await syncOnce();
    await prisma.$disconnect();
    // Exit after single run
  }
}

main().catch(async (e) => {
  logError("Критическая ошибка", e);
  await prisma.$disconnect();
  process.exit(1);
});
