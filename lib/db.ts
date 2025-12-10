import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA__: PrismaClient | undefined;
}

// Prefer DATABASE_URL (Next/Prisma default). Fallback to DATABASE_URL_DEV to keep docker-compose/dev compatibility.
const datasourceUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_DEV;

if (!datasourceUrl) {
  throw new Error("DATABASE_URL or DATABASE_URL_DEV must be set for Prisma.");
}

const adapter = new PrismaPg({ connectionString: datasourceUrl });

export const prisma =
  globalThis.__PRISMA__ ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalThis.__PRISMA__ = prisma;
