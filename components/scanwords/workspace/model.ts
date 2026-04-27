import type { DictionaryTemplateItem, FilterStats } from "@/types/dictionary-templates";
import type { Edition, Issue } from "../types";

export type WorkspaceTab = "dictionary" | "upload" | "conflicts" | "generation";

export type FillJobStatus = "queued" | "running" | "review" | "done" | "error";

export type FillTemplateStatus = {
  key?: string | null;
  name: string;
  status: "pending" | "running" | "done" | "error";
  error?: string | null;
  order?: number | null;
  sourceName?: string | null;
};

export type FillArchiveItem = {
  id: string;
  archiveKey: string;
  archiveFileName: string | null;
  status: FillJobStatus;
  completedTemplates: number | null;
  totalTemplates: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type FillJobState = {
  id: string;
  status: FillJobStatus;
  progress: number;
  currentTemplate?: string | null;
  completedTemplates?: number | null;
  totalTemplates?: number | null;
  error?: string | null;
  templates?: FillTemplateStatus[] | null;
  archiveReady?: boolean | null;
};

export type FillReviewDefinitionOption = {
  opredId: string | null;
  text: string;
  difficulty: number | null;
};

export type FillReviewIntersection = {
  slotId: number;
  index: number;
  otherIndex: number;
  row: number;
  col: number;
  letter: string;
};

export type FillReviewSlot = {
  slotId: number;
  r: number;
  c: number;
  dir: "down" | "right";
  len: number;
  cells: [number, number][];
  word: string;
  wordId: string | null;
  opredId: string | null;
  definition: string;
  definitionOptions: FillReviewDefinitionOption[];
  isPhotoDefinition?: boolean | null;
  intersections: FillReviewIntersection[];
  clueCell: { key: string; row: number; col: number } | null;
  startNumber?: number | null;
};

export type FillReviewStartPosition = {
  number: number;
  r: number;
  c: number;
  dir: "down" | "right";
  slotId: number;
};

export type FillReviewTemplate = {
  key: string;
  name: string;
  sourceName: string;
  order: number;
  path: string;
  language: string;
  langId: number | null;
  grid: {
    rows: number;
    cols: number;
    data: string[];
    marker: string;
    codes: number[][];
  };
  slots: FillReviewSlot[];
  clueGroups: Array<{
    key: string;
    row: number;
    col: number;
    slotIds: number[];
    areaCellCount?: number;
  }>;
  startPositions?: FillReviewStartPosition[];
};

export type FillReviewPayload = {
  version: 1;
  issue: {
    issueId: string;
    editionId: number;
    editionCode: string;
    issueLabel: string;
  };
  options: {
    style: "default" | "corel";
    writeCrw: boolean;
    usageStats: boolean;
  };
  templates: FillReviewTemplate[];
};

export type FillMaskCandidate = {
  wordId: string;
  word: string;
  definitions: FillReviewDefinitionOption[];
};

export type FillFinalizePayload = {
  templates: Array<{
    key: string;
    slots: Array<{
      slotId: number;
      word: string;
      definition: string;
      wordId: string | null;
      opredId: string | null;
    }>;
  }>;
  definitionLimits?: FillDefinitionLimits;
  svgTypography?: FillSvgTypography;
};

export type FillSpeedPreset = "fast" | "medium" | "slow";

export type FillDefinitionLimits = {
  maxPerCell: number;
  maxPerHalfCell: number;
};

export type FillSvgTypography = {
  clueFontBasePt: number;
  clueFontMinPt: number;
  clueGlyphWidthPct: number;
  clueLineHeightPct: number;
  fontId: string | null;
  systemFontFamily: string;
};

export type SvgFontItem = {
  id: string;
  displayName: string;
  familyName: string;
  format: string;
  mimeType: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type FillSettings = {
  speedPreset: FillSpeedPreset;
  definitionMaxPerCell: number;
  definitionMaxPerHalfCell: number;
  clueFontBasePt: number;
  clueFontMinPt: number;
  clueGlyphWidthPct: number;
  clueLineHeightPct: number;
  svgFontId: string | null;
  svgSystemFontFamily: string;
};

export type FillSettingsInput = {
  speedPreset?: string | null;
  definitionMaxPerCell?: number | string | null;
  definitionMaxPerHalfCell?: number | string | null;
  clueFontBasePt?: number | string | null;
  clueFontMinPt?: number | string | null;
  clueGlyphWidthPct?: number | string | null;
  clueLineHeightPct?: number | string | null;
  fontId?: string | null;
  svgFontId?: string | null;
  systemFontFamily?: string | null;
  svgSystemFontFamily?: string | null;
} | null;

export type FillSpeedOption = {
  value: FillSpeedPreset;
  label: string;
  maxNodes: number;
};

export type ConflictRow = {
  length: number;
  needed: number;
  available: number;
};

export type FillOverrides = {
  maxNodes: number;
  shuffle: boolean;
  unique: boolean;
  lcv: boolean;
  style: "default" | "corel";
  explainFail: boolean;
  noDefs: boolean;
  requireNative: boolean;
  filterTemplateId?: number;
};

export type ScanwordsWorkspaceProps = {
  selectedEdition: Edition | null;
  selectedIssue: Issue | null;
  templates: DictionaryTemplateItem[];
  selectedTemplateId: number | null;
  templatesLoading: boolean;
  templatesError: boolean;
  stats: FilterStats | null;
  statsLoading: boolean;
  statsError: boolean;
  dictionaryStats: FilterStats | null;
  dictionaryStatsLoading: boolean;
  dictionaryStatsError: boolean;
  onTemplateSelect: (templateId: number) => void;
};

export const SPEED_PRESETS: Record<FillSpeedPreset, { maxNodes: number }> = {
  fast: { maxNodes: 200_000 },
  medium: { maxNodes: 400_000 },
  slow: { maxNodes: 800_000 },
};

export const DEFAULT_DEFINITION_MAX_PER_CELL = 30;
export const DEFAULT_DEFINITION_MAX_PER_HALF_CELL = 15;
export const DEFAULT_SVG_CLUE_FONT_PT = 7;
export const DEFAULT_SVG_TYPOGRAPHY_PERCENT = 80;
export const DEFAULT_SVG_SYSTEM_FONT_FAMILY = "Arial";

export const DEFAULT_FILL_SETTINGS: FillSettings = {
  speedPreset: "fast",
  definitionMaxPerCell: DEFAULT_DEFINITION_MAX_PER_CELL,
  definitionMaxPerHalfCell: DEFAULT_DEFINITION_MAX_PER_HALF_CELL,
  clueFontBasePt: DEFAULT_SVG_CLUE_FONT_PT,
  clueFontMinPt: DEFAULT_SVG_CLUE_FONT_PT,
  clueGlyphWidthPct: DEFAULT_SVG_TYPOGRAPHY_PERCENT,
  clueLineHeightPct: DEFAULT_SVG_TYPOGRAPHY_PERCENT,
  svgFontId: null,
  svgSystemFontFamily: DEFAULT_SVG_SYSTEM_FONT_FAMILY,
};

function normalizePositiveInt(
  value: number | string | null | undefined,
  fallback: number,
  min = 1,
  max = 1024,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}

function normalizePositiveNumber(
  value: number | string | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return Math.round(parsed * 1000) / 1000;
}

export function normalizeFillSettings(input?: FillSettingsInput): FillSettings {
  const speed = input?.speedPreset;
  const speedPreset: FillSpeedPreset =
    speed === "fast" || speed === "medium" || speed === "slow" ? speed : DEFAULT_FILL_SETTINGS.speedPreset;
  const definitionMaxPerCell = normalizePositiveInt(
    input?.definitionMaxPerCell,
    DEFAULT_FILL_SETTINGS.definitionMaxPerCell,
  );
  const definitionMaxPerHalfCell = normalizePositiveInt(
    input?.definitionMaxPerHalfCell,
    DEFAULT_FILL_SETTINGS.definitionMaxPerHalfCell,
  );
  const clueFontBasePt = normalizePositiveNumber(input?.clueFontBasePt, DEFAULT_FILL_SETTINGS.clueFontBasePt, 1, 72);
  const clueFontMinPtRaw = normalizePositiveNumber(input?.clueFontMinPt, DEFAULT_FILL_SETTINGS.clueFontMinPt, 1, 72);
  const clueGlyphWidthPct = normalizePositiveInt(
    input?.clueGlyphWidthPct,
    DEFAULT_FILL_SETTINGS.clueGlyphWidthPct,
    40,
    200,
  );
  const clueLineHeightPct = normalizePositiveInt(
    input?.clueLineHeightPct,
    DEFAULT_FILL_SETTINGS.clueLineHeightPct,
    40,
    200,
  );
  const svgFontIdRaw = typeof input?.svgFontId === "string" ? input.svgFontId : input?.fontId;
  const svgFontId = typeof svgFontIdRaw === "string" && svgFontIdRaw.trim().length > 0 ? svgFontIdRaw.trim() : null;
  const svgSystemFontFamilyRaw =
    typeof input?.svgSystemFontFamily === "string" ? input.svgSystemFontFamily : input?.systemFontFamily;
  const svgSystemFontFamily =
    typeof svgSystemFontFamilyRaw === "string" && svgSystemFontFamilyRaw.trim().length > 0
      ? svgSystemFontFamilyRaw.trim().slice(0, 120)
      : DEFAULT_FILL_SETTINGS.svgSystemFontFamily;
  return {
    speedPreset,
    definitionMaxPerCell,
    definitionMaxPerHalfCell: Math.min(definitionMaxPerHalfCell, definitionMaxPerCell),
    clueFontBasePt,
    clueFontMinPt: Math.min(clueFontMinPtRaw, clueFontBasePt),
    clueGlyphWidthPct,
    clueLineHeightPct,
    svgFontId,
    svgSystemFontFamily,
  };
}
