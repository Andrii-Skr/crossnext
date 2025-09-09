-- ===========================
-- Без CITEXT, регистронезависимо через LOWER(...)
-- ===========================

-- 1) Таблица языков
CREATE TABLE IF NOT EXISTS "Language" (
  "id"   SERIAL PRIMARY KEY,
  "code" VARCHAR(8) UNIQUE NOT NULL,
  "name" VARCHAR(64) NOT NULL DEFAULT ''
);

-- 2) Добавляем langId (nullable) в word_v / opred_v
ALTER TABLE "word_v"  ADD COLUMN IF NOT EXISTS "langId" INTEGER;
ALTER TABLE "opred_v" ADD COLUMN IF NOT EXISTS "langId" INTEGER;

-- 3) Наполняем Language кодами из старых столбцов lang
INSERT INTO "Language" ("code","name")
SELECT x.lang_code, x.lang_code
FROM (
  SELECT DISTINCT CAST(lang AS TEXT) AS lang_code FROM "word_v"
  UNION
  SELECT DISTINCT CAST(lang AS TEXT) AS lang_code FROM "opred_v"
) AS x
WHERE x.lang_code IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Language" l WHERE l.code = x.lang_code);

-- 4) Бэкфилл langId
UPDATE "word_v" w
SET "langId" = l.id
FROM "Language" l
WHERE CAST(w.lang AS TEXT) = l.code
  AND w."langId" IS NULL;

UPDATE "opred_v" o
SET "langId" = l.id
FROM "Language" l
WHERE CAST(o.lang AS TEXT) = l.code
  AND o."langId" IS NULL;

-- 5) Делаем langId NOT NULL + внешние ключи
ALTER TABLE "word_v"  ALTER COLUMN "langId" SET NOT NULL;
ALTER TABLE "opred_v" ALTER COLUMN "langId" SET NOT NULL;

ALTER TABLE "word_v"
  ADD CONSTRAINT "word_v_langId_fkey"
  FOREIGN KEY ("langId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opred_v"
  ADD CONSTRAINT "opred_v_langId_fkey"
  FOREIGN KEY ("langId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6) ТАБЛИЦЫ ТЕГОВ (если их ещё нет)
CREATE TABLE IF NOT EXISTS "tags" (
  "id"        SERIAL PRIMARY KEY,
  "name"      VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "opred_tags" (
  "opredId" BIGINT  NOT NULL,
  "tagId"   INTEGER NOT NULL,
  "addedBy" VARCHAR(64),
  "addedAt" TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT "opred_tags_pkey" PRIMARY KEY ("opredId","tagId"),
  CONSTRAINT "opred_tags_opred_fkey" FOREIGN KEY ("opredId") REFERENCES "opred_v"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "opred_tags_tag_fkey"   FOREIGN KEY ("tagId")   REFERENCES "tags"("id")   ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "opred_tags_tagId_idx" ON "opred_tags" ("tagId");

-- 7) РЕГИСТРОНЕЗАВИСИМАЯ УНИКАЛЬНОСТЬ

-- 7.1 word_v: уникальность по lower(word_text), langId
--   ПЕРЕД ЭТИМ ПРОВЕРЬ ДУБЛИКАТЫ (см. запрос ниже), иначе индекс не создастся.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema() AND indexname = 'word_v_word_text_ci_langId_key'
  ) THEN
    CREATE UNIQUE INDEX "word_v_word_text_ci_langId_key"
    ON "word_v" (LOWER("word_text"), "langId");
  END IF;
END $$;

-- 7.2 tags: уникальность по lower(name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema() AND indexname = 'tags_name_ci_key'
  ) THEN
    CREATE UNIQUE INDEX "tags_name_ci_key"
    ON "tags" (LOWER("name"));
  END IF;
END $$;

-- 8) Удаляем старые 'lang'
ALTER TABLE "word_v"  DROP COLUMN IF EXISTS "lang";
ALTER TABLE "opred_v" DROP COLUMN IF EXISTS "lang";
