-- CreateTable
CREATE TABLE "jp_img" (
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
CREATE TABLE "log_coment" (
    "id" BIGSERIAL NOT NULL,
    "user" VARCHAR(64) NOT NULL DEFAULT '',
    "id_opr" BIGINT NOT NULL,
    "text_coment" VARCHAR(256) NOT NULL DEFAULT '',
    "add_data" DATE,

    CONSTRAINT "log_coment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opred_v" (
    "id" BIGSERIAL NOT NULL,
    "word_id" BIGINT NOT NULL DEFAULT -1,
    "text_opr" VARCHAR(255) NOT NULL DEFAULT '',
    "count_char" BIGINT NOT NULL DEFAULT -1,
    "end_date" TIMESTAMP(6),
    "lang" CHAR(1) NOT NULL DEFAULT 'r',
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

    CONSTRAINT "opred_v_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shablons" (
    "id" BIGSERIAL NOT NULL,
    "w" BIGINT NOT NULL DEFAULT 0,
    "h" BIGINT NOT NULL DEFAULT 0,
    "mask" TEXT NOT NULL,
    "foto" BIGINT NOT NULL DEFAULT 0,
    "bin_data" BYTEA NOT NULL,

    CONSTRAINT "shablons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
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
CREATE TABLE "word_v" (
    "id" BIGSERIAL NOT NULL,
    "word_text" CHAR(255) NOT NULL,
    "length" SMALLINT NOT NULL,
    "lang" CHAR(1) NOT NULL DEFAULT 'r',
    "file_id" BIGINT NOT NULL DEFAULT -1,
    "user_add" VARCHAR(255) NOT NULL DEFAULT 'system',
    "create_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "using" SMALLINT NOT NULL DEFAULT 1,
    "korny" TEXT NOT NULL,
    "data_set" TIMESTAMP(6),
    "user_set" VARCHAR(255) NOT NULL DEFAULT '',
    "go_flag" SMALLINT NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "word_v_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "opred_v" ADD CONSTRAINT "word_fkey" FOREIGN KEY ("word_id") REFERENCES "word_v"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
