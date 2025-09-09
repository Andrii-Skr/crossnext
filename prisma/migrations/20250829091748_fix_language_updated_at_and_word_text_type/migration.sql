-- гарантируем работу по схеме zenit
SET search_path = zenit, public;

-- 1) Language: добавляем createdAt/updatedAt c DEFAULT now(), чтобы backfill прошёл
ALTER TABLE "Language"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(6) NOT NULL DEFAULT now();

ALTER TABLE "Language"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT now();

-- (Опционально) Если хочешь, после бэкапа можно убрать дефолт у updatedAt:
-- ALTER TABLE "Language" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- 2) word_v.word_text: меняем тип на VARCHAR(255) с явным кастом
-- (если сейчас уже VARCHAR(255), этот шаг выполнится без эффекта)
ALTER TABLE "word_v"
  ALTER COLUMN "word_text" TYPE VARCHAR(255)
  USING "word_text"::VARCHAR(255);
