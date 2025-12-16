// lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // DATABASE_URL требуется только во время рантайма; во время сборки Docker он отсутствует,
  // так как формируется entrypoint'ом из POSTGRES_* и секрета. Делаем его необязательным.
  DATABASE_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be set"),
  NEXTAUTH_URL: z.string().url(),
  // ADMIN_* нужны только для сидинга и тестов —
  // приложение в рантайме не зависит от них напрямую.
  ADMIN_LOGIN: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

const parsed = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  ADMIN_LOGIN: process.env.ADMIN_LOGIN,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
});

export const env = parsed;
