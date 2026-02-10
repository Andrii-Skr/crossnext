CREATE TABLE IF NOT EXISTS "public"."scanword_fill_jobs" (
  "id" BIGSERIAL NOT NULL,
  "issueId" BIGINT NOT NULL,
  "status" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "currentTemplate" TEXT,
  "completedTemplates" INTEGER,
  "totalTemplates" INTEGER,
  "error" TEXT,
  "outputPath" TEXT,
  "outputSize" BIGINT,
  "templates" JSONB,
  "options" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scanword_fill_jobs_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'issues'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'scanword_fill_jobs_issueId_fkey'
  ) THEN
      ALTER TABLE "public"."scanword_fill_jobs"
      ADD CONSTRAINT "scanword_fill_jobs_issueId_fkey"
      FOREIGN KEY ("issueId") REFERENCES "public"."issues"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_scanword_fill_jobs_issue"
  ON "public"."scanword_fill_jobs"("issueId");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_scanword_fill_jobs_issue_active"
  ON "public"."scanword_fill_jobs"("issueId")
  WHERE "status" IN ('queued', 'running');

ALTER TABLE "public"."scanword_fill_jobs"
  ADD COLUMN IF NOT EXISTS "currentTemplate" TEXT,
  ADD COLUMN IF NOT EXISTS "completedTemplates" INTEGER,
  ADD COLUMN IF NOT EXISTS "totalTemplates" INTEGER,
  ADD COLUMN IF NOT EXISTS "error" TEXT,
  ADD COLUMN IF NOT EXISTS "outputPath" TEXT,
  ADD COLUMN IF NOT EXISTS "outputSize" BIGINT,
  ADD COLUMN IF NOT EXISTS "templates" JSONB,
  ADD COLUMN IF NOT EXISTS "options" JSONB,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
