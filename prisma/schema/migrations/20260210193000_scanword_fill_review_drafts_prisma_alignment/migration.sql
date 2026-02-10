DO $$
BEGIN
  IF to_regclass('public.scanword_fill_review_drafts') IS NULL THEN
    CREATE TABLE "public"."scanword_fill_review_drafts" (
      "id" BIGSERIAL NOT NULL,
      "jobId" BIGINT NOT NULL,
      "userId" INTEGER NOT NULL,
      "data" JSONB NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMPTZ,
      CONSTRAINT "scanword_fill_review_drafts_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "scanword_fill_review_drafts_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  END IF;
END $$;

ALTER TABLE "public"."scanword_fill_review_drafts"
  ADD COLUMN IF NOT EXISTS "data" JSONB,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scanword_fill_review_drafts'
      AND column_name = 'reviewData'
  ) THEN
    EXECUTE '
      UPDATE "public"."scanword_fill_review_drafts"
      SET "data" = COALESCE("data", "reviewData")
      WHERE "data" IS NULL
    ';
  END IF;
END $$;

UPDATE "public"."scanword_fill_review_drafts"
SET "data" = '{"version":2,"rows":[]}'::jsonb
WHERE "data" IS NULL;

UPDATE "public"."scanword_fill_review_drafts"
SET "createdAt" = CURRENT_TIMESTAMP
WHERE "createdAt" IS NULL;

UPDATE "public"."scanword_fill_review_drafts"
SET "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "updatedAt" IS NULL;

ALTER TABLE "public"."scanword_fill_review_drafts"
  ALTER COLUMN "data" SET NOT NULL,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "scanword_fill_review_drafts_jobId_userId_key"
  ON "public"."scanword_fill_review_drafts"("jobId", "userId");

CREATE INDEX IF NOT EXISTS "idx_scanword_fill_review_drafts_user"
  ON "public"."scanword_fill_review_drafts"("userId");

CREATE INDEX IF NOT EXISTS "idx_scanword_fill_review_drafts_updatedAt"
  ON "public"."scanword_fill_review_drafts"("updatedAt");

CREATE INDEX IF NOT EXISTS "idx_scanword_fill_review_drafts_expiresAt"
  ON "public"."scanword_fill_review_drafts"("expiresAt");
