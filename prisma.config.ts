import fs from "node:fs";
import path from "node:path";
import { defineConfig, PrismaConfigEnvError } from "@prisma/config";
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

const datasourceUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_DEV;

if (!datasourceUrl) {
  throw new PrismaConfigEnvError("DATABASE_URL");
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
