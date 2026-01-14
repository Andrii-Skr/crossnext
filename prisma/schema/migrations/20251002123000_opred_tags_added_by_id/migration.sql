-- Add numeric addedBy and backfill from auth_users email where possible.
ALTER TABLE "public"."opred_tags" ADD COLUMN "addedById" INTEGER;

UPDATE "public"."opred_tags" AS ot
SET "addedById" = au.id
FROM "public"."auth_users" AS au
WHERE ot."addedBy" IS NOT NULL
  AND ot."addedBy" = au.email;

ALTER TABLE "public"."opred_tags" DROP COLUMN "addedBy";
ALTER TABLE "public"."opred_tags" RENAME COLUMN "addedById" TO "addedBy";
