import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@prisma/config";
import dotenv from "dotenv";

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env");
const envLocalPath = path.join(projectRoot, ".env.local");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

if (fs.existsSync(envLocalPath)) {
  // При локальной разработке .env.local имеет приоритет
  dotenv.config({ path: envLocalPath, override: true });
}

const datasourceUrl =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_DEV ??
  process.env.PRISMA_FALLBACK_URL ??
  "postgresql://prisma:prisma@localhost:5432/prisma?schema=public";

if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_DEV) {
  console.warn(
    "[prisma.config] DATABASE_URL не задан — используется fallback url (postgresql://prisma:prisma@localhost:5432/prisma?schema=public). " +
      "Для production/миграций обязательно задайте DATABASE_URL.",
  );
}

export default defineConfig({
  schema: "prisma/schema",
  datasource: {
    url: datasourceUrl,
  },
  migrations: {
    path: "prisma/schema/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
