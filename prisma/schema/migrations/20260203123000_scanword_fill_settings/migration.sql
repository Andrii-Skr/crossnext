CREATE TABLE "public"."scanword_fill_settings" (
  "id" BIGSERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "speedPreset" VARCHAR(16) NOT NULL,
  "parallel" INTEGER NOT NULL DEFAULT 2,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scanword_fill_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scanword_fill_settings_userId_key" UNIQUE ("userId"),
  CONSTRAINT "scanword_fill_settings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
