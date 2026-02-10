CREATE TABLE IF NOT EXISTS "public"."scanword_fill_review_drafts" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "scanword_fill_review_drafts_jobId_userId_key"
  ON "public"."scanword_fill_review_drafts"("jobId", "userId");

CREATE INDEX IF NOT EXISTS "idx_scanword_fill_review_drafts_user"
  ON "public"."scanword_fill_review_drafts"("userId");

CREATE INDEX IF NOT EXISTS "idx_scanword_fill_review_drafts_updatedAt"
  ON "public"."scanword_fill_review_drafts"("updatedAt");

CREATE INDEX IF NOT EXISTS "idx_scanword_fill_review_drafts_expiresAt"
  ON "public"."scanword_fill_review_drafts"("expiresAt");
