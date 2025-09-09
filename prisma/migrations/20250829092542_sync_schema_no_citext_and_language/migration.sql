-- AlterTable
ALTER TABLE "Language" ALTER COLUMN "name" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "opred_tags" ALTER COLUMN "addedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tags" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "word_v" ALTER COLUMN "create_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "log_coment_id_opr_idx" ON "log_coment"("id_opr");

-- CreateIndex
CREATE INDEX "opred_v_word_id_is_deleted_idx" ON "opred_v"("word_id", "is_deleted");

-- CreateIndex
CREATE INDEX "word_v_is_deleted_idx" ON "word_v"("is_deleted");

-- RenameForeignKey
ALTER TABLE "opred_tags" RENAME CONSTRAINT "opred_tags_opred_fkey" TO "opred_tags_opredId_fkey";

-- RenameForeignKey
ALTER TABLE "opred_tags" RENAME CONSTRAINT "opred_tags_tag_fkey" TO "opred_tags_tagId_fkey";
