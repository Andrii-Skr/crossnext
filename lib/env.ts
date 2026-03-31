// lib/env.ts
import { z } from "zod";

const boolEnv = (defaultValue: "0" | "1") =>
  z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
      z.enum(["0", "1", "false", "true"]).default(defaultValue),
    )
    .transform((value) => value === "1" || value === "true");

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
  CSP_REPORT_ONLY: boolEnv("0"),
  CSP_REPORT_ENABLED: boolEnv("1"),
  CSP_REPORT_LOG: boolEnv("0"),
});

const parsed = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  ADMIN_LOGIN: process.env.ADMIN_LOGIN,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  CSP_REPORT_ONLY: process.env.CSP_REPORT_ONLY,
  CSP_REPORT_ENABLED: process.env.CSP_REPORT_ENABLED,
  CSP_REPORT_LOG: process.env.CSP_REPORT_LOG,
});

export const env = parsed;
