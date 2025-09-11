-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."PendingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'MANAGER', 'USER');

-- CreateTable
CREATE TABLE "public"."tags" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."opred_tags" (
    "opredId" BIGINT NOT NULL,
    "tagId" INTEGER NOT NULL,
    "addedBy" VARCHAR(64),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opred_tags_pkey" PRIMARY KEY ("opredId","tagId")
);

-- CreateTable
CREATE TABLE "public"."word_v" (
    "id" BIGSERIAL NOT NULL,
    "word_text" VARCHAR(255) NOT NULL,
    "length" SMALLINT NOT NULL,
    "file_id" BIGINT NOT NULL DEFAULT -1,
    "user_add" VARCHAR(255) NOT NULL DEFAULT 'system',
    "create_at" TIMESTAMP(6),
    "using" SMALLINT NOT NULL DEFAULT 1,
    "korny" TEXT NOT NULL,
    "data_set" TIMESTAMP(6),
    "user_set" VARCHAR(255) NOT NULL DEFAULT '',
    "go_flag" SMALLINT NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "langId" INTEGER NOT NULL,

    CONSTRAINT "word_v_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pending_words" (
    "id" BIGSERIAL NOT NULL,
    "word_text" VARCHAR(255) NOT NULL,
    "length" SMALLINT NOT NULL,
    "langId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(512) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."PendingStatus" NOT NULL DEFAULT 'PENDING',
    "targetWordId" BIGINT,

    CONSTRAINT "pending_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pending_descriptions" (
    "id" BIGSERIAL NOT NULL,
    "pendingWordId" BIGINT NOT NULL,
    "description" VARCHAR(1024) NOT NULL,
    "note" VARCHAR(512) NOT NULL,
    "status" "public"."PendingStatus" NOT NULL DEFAULT 'PENDING',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "approvedOpredId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."opred_v" (
    "id" BIGSERIAL NOT NULL,
    "word_id" BIGINT NOT NULL DEFAULT -1,
    "text_opr" VARCHAR(255) NOT NULL DEFAULT '',
    "count_char" BIGINT NOT NULL DEFAULT -1,
    "end_date" TIMESTAMP(6),
    "tema" BIGINT NOT NULL DEFAULT 0,
    "livel" SMALLINT NOT NULL DEFAULT 1,
    "id_file" BIGINT NOT NULL DEFAULT -1,
    "use" SMALLINT NOT NULL DEFAULT 1,
    "user_add" VARCHAR(32) NOT NULL DEFAULT '',
    "create_at" TIMESTAMP(6),
    "edit_user" VARCHAR(32) NOT NULL DEFAULT '',
    "update_at" TIMESTAMP(6),
    "coment" VARCHAR(512) NOT NULL DEFAULT '',
    "set_reg" BIGINT NOT NULL DEFAULT 3,
    "data_set" TIMESTAMP(6),
    "user_set" VARCHAR(255) NOT NULL DEFAULT '',
    "go_flag" SMALLINT NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "langId" INTEGER NOT NULL,

    CONSTRAINT "opred_v_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "password" VARCHAR(9) NOT NULL,
    "menu" VARCHAR(255) NOT NULL DEFAULT 'menu_admin',
    "fio" VARCHAR(255) NOT NULL,
    "pamd" VARCHAR(64) NOT NULL,
    "end_free" DATE,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."jp_img" (
    "id" BIGSERIAL NOT NULL,
    "w" BIGINT NOT NULL,
    "h" BIGINT NOT NULL,
    "livel" BIGINT NOT NULL DEFAULT 3,
    "t_8x8" TEXT NOT NULL,
    "t_16x16" TEXT NOT NULL,
    "sorc" BYTEA NOT NULL,
    "use_number" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "add_date" DATE,
    "add_user" VARCHAR(256) NOT NULL DEFAULT '',

    CONSTRAINT "jp_img_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."log_coment" (
    "id" BIGSERIAL NOT NULL,
    "user" VARCHAR(64) NOT NULL DEFAULT '',
    "id_opr" BIGINT NOT NULL,
    "text_coment" VARCHAR(256) NOT NULL DEFAULT '',
    "add_data" DATE,

    CONSTRAINT "log_coment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shablons" (
    "id" BIGSERIAL NOT NULL,
    "w" BIGINT NOT NULL DEFAULT 0,
    "h" BIGINT NOT NULL DEFAULT 0,
    "mask" TEXT NOT NULL,
    "foto" BIGINT NOT NULL DEFAULT 0,
    "bin_data" BYTEA NOT NULL,

    CONSTRAINT "shablons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."auth_users" (
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'USER',
    "passwordHash" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "id" SERIAL NOT NULL,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."auth_accounts" (
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."auth_sessions" (
    "sessionToken" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."auth_verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "public"."language" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opred_tags_tagId_idx" ON "public"."opred_tags"("tagId");

-- CreateIndex
CREATE INDEX "word_v_is_deleted_idx" ON "public"."word_v"("is_deleted");

-- CreateIndex
CREATE INDEX "pending_words_targetWordId_idx" ON "public"."pending_words"("targetWordId");

-- CreateIndex
CREATE INDEX "pending_words_langId_word_text_idx" ON "public"."pending_words"("langId", "word_text");

-- CreateIndex
CREATE INDEX "pending_descriptions_pendingWordId_idx" ON "public"."pending_descriptions"("pendingWordId");

-- CreateIndex
CREATE INDEX "opred_v_word_id_is_deleted_idx" ON "public"."opred_v"("word_id", "is_deleted");

-- CreateIndex
CREATE INDEX "log_coment_id_opr_idx" ON "public"."log_coment"("id_opr");

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_email_key" ON "public"."auth_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_providerAccountId_key" ON "public"."auth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_sessionToken_key" ON "public"."auth_sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_tokens_token_key" ON "public"."auth_verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_tokens_identifier_token_key" ON "public"."auth_verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Language_code_key" ON "public"."language"("code");

-- AddForeignKey
ALTER TABLE "public"."opred_tags" ADD CONSTRAINT "opred_tags_opredId_fkey" FOREIGN KEY ("opredId") REFERENCES "public"."opred_v"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opred_tags" ADD CONSTRAINT "opred_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."word_v" ADD CONSTRAINT "word_v_langId_fkey" FOREIGN KEY ("langId") REFERENCES "public"."language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pending_words" ADD CONSTRAINT "pending_words_langId_fkey" FOREIGN KEY ("langId") REFERENCES "public"."language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pending_words" ADD CONSTRAINT "pending_words_targetWordId_fkey" FOREIGN KEY ("targetWordId") REFERENCES "public"."word_v"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pending_descriptions" ADD CONSTRAINT "pending_descriptions_approvedOpredId_fkey" FOREIGN KEY ("approvedOpredId") REFERENCES "public"."opred_v"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pending_descriptions" ADD CONSTRAINT "pending_descriptions_pendingWordId_fkey" FOREIGN KEY ("pendingWordId") REFERENCES "public"."pending_words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opred_v" ADD CONSTRAINT "opred_v_langId_fkey" FOREIGN KEY ("langId") REFERENCES "public"."language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opred_v" ADD CONSTRAINT "word_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."word_v"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

