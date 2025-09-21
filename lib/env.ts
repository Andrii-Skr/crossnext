// lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be set"),
  NEXTAUTH_URL: z.string().url(),
  ADMIN_LOGIN: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(8),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  ADMIN_LOGIN: process.env.ADMIN_LOGIN ?? "admin",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
});
