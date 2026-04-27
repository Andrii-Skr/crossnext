CREATE TABLE "public"."scanword_svg_fonts" (
  "id" BIGSERIAL NOT NULL,
  "displayName" VARCHAR(120) NOT NULL,
  "familyName" VARCHAR(120) NOT NULL,
  "format" VARCHAR(16) NOT NULL,
  "mimeType" VARCHAR(64) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "storageRelPath" VARCHAR(512) NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scanword_svg_fonts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scanword_svg_fonts_sha256_key"
  ON "public"."scanword_svg_fonts"("sha256");

CREATE INDEX "idx_scanword_svg_fonts_display"
  ON "public"."scanword_svg_fonts"("displayName");

CREATE INDEX "idx_scanword_svg_fonts_created"
  ON "public"."scanword_svg_fonts"("createdAt");

CREATE TABLE "public"."scanword_issue_svg_settings" (
  "id" BIGSERIAL NOT NULL,
  "issueId" BIGINT NOT NULL,
  "clueFontBasePt" INTEGER NOT NULL DEFAULT 7,
  "clueFontMinPt" INTEGER NOT NULL DEFAULT 7,
  "fontId" BIGINT,
  "systemFontFamily" VARCHAR(120) NOT NULL DEFAULT 'Arial',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scanword_issue_svg_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scanword_issue_svg_settings_issueId_key"
  ON "public"."scanword_issue_svg_settings"("issueId");

CREATE INDEX "idx_scanword_issue_svg_settings_font"
  ON "public"."scanword_issue_svg_settings"("fontId");

ALTER TABLE "public"."scanword_issue_svg_settings"
  ADD CONSTRAINT "scanword_issue_svg_settings_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "public"."issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."scanword_issue_svg_settings"
  ADD CONSTRAINT "scanword_issue_svg_settings_fontId_fkey"
    FOREIGN KEY ("fontId") REFERENCES "public"."scanword_svg_fonts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
