-- Keep scanword_fill_jobs compatible with cross service expectations.
-- Safe to run multiple times.

ALTER TABLE "public"."scanword_fill_jobs"
  ADD COLUMN IF NOT EXISTS "currentTemplate" TEXT,
  ADD COLUMN IF NOT EXISTS "completedTemplates" INTEGER,
  ADD COLUMN IF NOT EXISTS "totalTemplates" INTEGER,
  ADD COLUMN IF NOT EXISTS "error" TEXT,
  ADD COLUMN IF NOT EXISTS "outputPath" TEXT,
  ADD COLUMN IF NOT EXISTS "outputSize" BIGINT,
  ADD COLUMN IF NOT EXISTS "templates" JSONB,
  ADD COLUMN IF NOT EXISTS "reviewData" JSONB,
  ADD COLUMN IF NOT EXISTS "options" JSONB,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "idx_scanword_fill_jobs_issue"
  ON "public"."scanword_fill_jobs"("issueId");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_scanword_fill_jobs_issue_active"
  ON "public"."scanword_fill_jobs"("issueId")
  WHERE "status" IN ('queued', 'running');
