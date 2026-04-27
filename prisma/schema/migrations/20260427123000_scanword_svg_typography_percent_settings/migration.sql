ALTER TABLE "public"."scanword_issue_svg_settings"
  ADD COLUMN IF NOT EXISTS "clueGlyphWidthPct" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS "clueLineHeightPct" INTEGER NOT NULL DEFAULT 80;

