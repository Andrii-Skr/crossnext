import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA__: PrismaClient | undefined;
}

// Prefer DATABASE_URL (Next/Prisma default). Fallback to DATABASE_URL_DEV to keep docker-compose/dev compatibility.
const datasourceUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_DEV;

export const prisma =
  globalThis.__PRISMA__ ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
  });

if (process.env.NODE_ENV !== "production") globalThis.__PRISMA__ = prisma;
