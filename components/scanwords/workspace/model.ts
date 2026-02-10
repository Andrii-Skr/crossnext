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
  intersections: FillReviewIntersection[];
  clueCell: { key: string; row: number; col: number } | null;
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
  }>;
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
};

export type FillSpeedPreset = "fast" | "medium" | "slow";

export type FillSettings = {
  speedPreset: FillSpeedPreset;
  parallel: number;
};

export type FillSettingsInput = {
  speedPreset?: string;
  parallel?: number;
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

export type FillDraftOptions = {
  speedPreset: FillSpeedPreset;
  parallel: number;
  maxNodes: number;
  restarts: number;
};

export type FillOverrides = {
  maxNodes: number;
  parallelRestarts: number;
  restarts: number;
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

export const SPEED_PRESETS: Record<FillSpeedPreset, { maxNodes: number; restartsMultiplier: number }> = {
  fast: { maxNodes: 2_000_000, restartsMultiplier: 2 },
  medium: { maxNodes: 4_000_000, restartsMultiplier: 3 },
  slow: { maxNodes: 8_000_000, restartsMultiplier: 4 },
};

export const PARALLEL_MIN = 1;
export const PARALLEL_MAX = 32;
export const DEFAULT_FILL_SETTINGS: FillSettings = { speedPreset: "fast", parallel: 2 };

export function normalizeFillSettings(input?: FillSettingsInput): FillSettings {
  const speed = input?.speedPreset;
  const speedPreset: FillSpeedPreset =
    speed === "fast" || speed === "medium" || speed === "slow" ? speed : DEFAULT_FILL_SETTINGS.speedPreset;
  const parallelRaw = typeof input?.parallel === "number" ? input.parallel : DEFAULT_FILL_SETTINGS.parallel;
  const parallel = Math.min(PARALLEL_MAX, Math.max(PARALLEL_MIN, Math.round(parallelRaw)));
  return { speedPreset, parallel };
}
