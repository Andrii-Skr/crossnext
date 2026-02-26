"use client";

import type { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getScanwordFillArchivesAction,
  getScanwordFillSettingsAction,
  saveScanwordFillSettingsAction,
} from "@/app/actions/scanwords";
import {
  DEFAULT_FILL_SETTINGS,
  type FillArchiveItem,
  type FillDraftOptions,
  type FillFinalizePayload,
  type FillJobState,
  type FillJobStatus,
  type FillMaskCandidate,
  type FillOverrides,
  type FillReviewDefinitionOption,
  type FillReviewPayload,
  type FillSettings,
  type FillSpeedOption,
  type FillSpeedPreset,
  type FillTemplateStatus,
  normalizeFillSettings,
  PARALLEL_MAX,
  PARALLEL_MIN,
  SPEED_PRESETS,
} from "../model";

type TranslateFn = ReturnType<typeof useTranslations>;

type UseScanwordFillParams = {
  selectedIssueId: string | null;
  selectedTemplateId: number | null;
  filesSignature: string;
  crossApiBase: string;
  t: TranslateFn;
};

const DEFINITIONS_DIFFICULTY_BATCH_SIZE = 5000;
const FILL_USAGE_STATS_STORAGE_KEY = "scanwords:fillSettings:usageStats";

function buildReviewDismissStorageKey(jobId: string): string {
  return `scanwords:fillReviewDismissed:${jobId}`;
}

function readStoredUsageStats(): boolean | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(FILL_USAGE_STATS_STORAGE_KEY);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return null;
}

function writeStoredUsageStats(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FILL_USAGE_STATS_STORAGE_KEY, value ? "1" : "0");
}

function normalizeDifficultyValue(value: unknown): number | null {
  if (!Number.isFinite(value as number)) return null;
  return Math.trunc(value as number);
}

function normalizeDefinitionOptionsWithDifficulties(
  options: FillReviewDefinitionOption[],
  difficultyById: Map<string, number>,
): FillReviewDefinitionOption[] {
  return options.map((option) => {
    const opredId = option.opredId ? String(option.opredId) : null;
    const difficultyFromMap = opredId ? difficultyById.get(opredId) : undefined;
    return {
      opredId,
      text: option.text,
      difficulty: normalizeDifficultyValue(difficultyFromMap ?? option.difficulty),
    };
  });
}

function collectDefinitionOptionIdsFromPayload(payload: FillReviewPayload): string[] {
  const ids = new Set<string>();
  for (const template of payload.templates) {
    for (const slot of template.slots) {
      for (const option of slot.definitionOptions) {
        if (!option.opredId) continue;
        ids.add(String(option.opredId));
      }
    }
  }
  return [...ids];
}

function collectDefinitionOptionIdsFromCandidates(candidates: FillMaskCandidate[]): string[] {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    for (const option of candidate.definitions) {
      if (!option.opredId) continue;
      ids.add(String(option.opredId));
    }
  }
  return [...ids];
}

function normalizeReviewPayloadWithDifficulties(
  payload: FillReviewPayload,
  difficultyById: Map<string, number>,
): FillReviewPayload {
  return {
    ...payload,
    templates: payload.templates.map((template) => ({
      ...template,
      slots: template.slots.map((slot) => ({
        ...slot,
        definitionOptions: normalizeDefinitionOptionsWithDifficulties(slot.definitionOptions, difficultyById),
      })),
    })),
  };
}

function normalizeCandidatesWithDifficulties(
  candidates: FillMaskCandidate[],
  difficultyById: Map<string, number>,
): FillMaskCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    definitions: normalizeDefinitionOptionsWithDifficulties(candidate.definitions, difficultyById),
  }));
}

export function useScanwordFill({
  selectedIssueId,
  selectedTemplateId,
  filesSignature,
  crossApiBase,
  t,
}: UseScanwordFillParams) {
  const [fillJob, setFillJob] = useState<FillJobState | null>(null);
  const [fillStarting, setFillStarting] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const [fillSettings, setFillSettings] = useState<FillSettings>(DEFAULT_FILL_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<FillSettings>(DEFAULT_FILL_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [latestArchiveOnly, setLatestArchiveOnly] = useState(true);
  const [archivesDialogOpen, setArchivesDialogOpen] = useState(false);
  const [archivesLoading, setArchivesLoading] = useState(false);
  const [archivesError, setArchivesError] = useState<string | null>(null);
  const [archives, setArchives] = useState<FillArchiveItem[]>([]);
  const [templateList, setTemplateList] = useState<FillTemplateStatus[]>([]);
  const [reviewOpen, setReviewOpenState] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewFinalizing, setReviewFinalizing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<FillReviewPayload | null>(null);
  const prevIssueIdRef = useRef<string | null | undefined>(undefined);
  const prevTemplateIdRef = useRef<number | null | undefined>(undefined);
  const prevFilesSignatureRef = useRef<string | undefined>(undefined);
  const loadedReviewJobIdRef = useRef<string | null>(null);
  const definitionDifficultyCacheRef = useRef<Map<string, number>>(new Map());

  const normalizeFillJob = useCallback((raw: unknown): FillJobState | null => {
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Partial<FillJobState> & { id?: string | number; status?: string; progress?: number };
    if (!data.id) return null;
    const status =
      data.status === "queued" ||
      data.status === "running" ||
      data.status === "review" ||
      data.status === "done" ||
      data.status === "error"
        ? data.status
        : "queued";
    const templates = Array.isArray(data.templates)
      ? data.templates
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Partial<FillTemplateStatus> & {
              order?: number | null;
              sourceName?: string | null;
              key?: string | number | null;
            };
            if (!row.name) return null;
            const tStatus =
              row.status === "pending" || row.status === "running" || row.status === "done" || row.status === "error"
                ? row.status
                : "pending";
            return {
              key: row.key != null ? String(row.key) : null,
              name: String(row.name),
              status: tStatus,
              error: row.error ?? null,
              order: typeof row.order === "number" ? row.order : null,
              sourceName: typeof row.sourceName === "string" ? row.sourceName : null,
            } as FillTemplateStatus;
          })
          .filter((row): row is FillTemplateStatus => Boolean(row))
      : null;
    return {
      id: String(data.id),
      status,
      progress: Number.isFinite(data.progress as number) ? Number(data.progress) : 0,
      currentTemplate: data.currentTemplate ?? null,
      completedTemplates: data.completedTemplates ?? null,
      totalTemplates: data.totalTemplates ?? null,
      error: data.error ?? null,
      templates,
      archiveReady: typeof data.archiveReady === "boolean" ? data.archiveReady : null,
    };
  }, []);

  const normalizeReviewPayload = useCallback((raw: unknown): FillReviewPayload | null => {
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Partial<FillReviewPayload>;
    if (data.version !== 1 || !data.issue || !Array.isArray(data.templates)) return null;
    return data as FillReviewPayload;
  }, []);

  const ensureDefinitionDifficulties = useCallback(async (ids: string[]): Promise<Map<string, number>> => {
    const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)));
    if (!uniqueIds.length) return new Map();

    const missingIds = uniqueIds.filter((id) => !definitionDifficultyCacheRef.current.has(id));

    if (missingIds.length > 0) {
      for (let offset = 0; offset < missingIds.length; offset += DEFINITIONS_DIFFICULTY_BATCH_SIZE) {
        const idsChunk = missingIds.slice(offset, offset + DEFINITIONS_DIFFICULTY_BATCH_SIZE);
        try {
          const res = await fetch("/api/dictionary/definitions-difficulty", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: idsChunk }),
          });
          const data = await res.json();
          if (!res.ok || !Array.isArray(data?.items)) continue;
          for (const item of data.items as Array<{ id?: unknown; difficulty?: unknown }>) {
            if (typeof item?.id !== "string" || item.id.length === 0) continue;
            const difficulty = normalizeDifficultyValue(item.difficulty);
            if (difficulty == null) continue;
            definitionDifficultyCacheRef.current.set(item.id, difficulty);
          }
        } catch {
          // Ignore network errors.
        }
      }
    }

    const result = new Map<string, number>();
    for (const id of uniqueIds) {
      const difficulty = definitionDifficultyCacheRef.current.get(id);
      if (typeof difficulty !== "number") continue;
      result.set(id, difficulty);
    }
    return result;
  }, []);

  const resetFillState = useCallback(() => {
    setFillJob(null);
    setFillStarting(false);
    setFillError(null);
    setTemplateList([]);
    setReviewOpenState(false);
    setReviewLoading(false);
    setReviewFinalizing(false);
    setReviewError(null);
    setReviewData(null);
    loadedReviewJobIdRef.current = null;
    definitionDifficultyCacheRef.current.clear();
  }, []);

  useEffect(() => {
    if (prevIssueIdRef.current === selectedIssueId) return;
    prevIssueIdRef.current = selectedIssueId;
    setFillJob(null);
    setFillStarting(false);
    setFillError(null);
    setLatestArchiveOnly(true);
    setArchivesDialogOpen(false);
    setArchivesLoading(false);
    setArchivesError(null);
    setArchives([]);
    setTemplateList([]);
    setReviewOpenState(false);
    setReviewLoading(false);
    setReviewFinalizing(false);
    setReviewError(null);
    setReviewData(null);
    loadedReviewJobIdRef.current = null;
    definitionDifficultyCacheRef.current.clear();
  }, [selectedIssueId]);

  const isReviewDismissed = useCallback((jobId: string): boolean => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(buildReviewDismissStorageKey(jobId)) === "1";
  }, []);

  const markReviewDismissed = useCallback((jobId: string) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(buildReviewDismissStorageKey(jobId), "1");
  }, []);

  const clearReviewDismissed = useCallback((jobId: string) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(buildReviewDismissStorageKey(jobId));
  }, []);

  const setReviewOpen = useCallback(
    (nextOpen: boolean) => {
      const jobId = fillJob?.id ?? null;
      if (jobId) {
        if (nextOpen) clearReviewDismissed(jobId);
        else if (fillJob?.status === "review") markReviewDismissed(jobId);
      }
      setReviewOpenState(nextOpen);
    },
    [clearReviewDismissed, fillJob?.id, fillJob?.status, markReviewDismissed],
  );

  useEffect(() => {
    const next = selectedTemplateId ?? null;
    if (prevTemplateIdRef.current === undefined) {
      prevTemplateIdRef.current = next;
      return;
    }
    if (prevTemplateIdRef.current !== next) {
      prevTemplateIdRef.current = next;
      resetFillState();
    }
  }, [resetFillState, selectedTemplateId]);

  useEffect(() => {
    if (prevFilesSignatureRef.current === undefined) {
      prevFilesSignatureRef.current = filesSignature;
      return;
    }
    if (prevFilesSignatureRef.current !== filesSignature) {
      prevFilesSignatureRef.current = filesSignature;
      resetFillState();
    }
  }, [filesSignature, resetFillState]);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      const usageStats = readStoredUsageStats();
      try {
        const saved = await getScanwordFillSettingsAction();
        if (!active) return;
        const normalized = normalizeFillSettings({
          ...(saved ?? {}),
          ...(usageStats !== null ? { usageStats } : {}),
        });
        setFillSettings(normalized);
        setSettingsDraft(normalized);
      } catch {
        if (!active || usageStats === null) return;
        setFillSettings((prev) => ({ ...prev, usageStats }));
        setSettingsDraft((prev) => ({ ...prev, usageStats }));
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedIssueId) return;
    let active = true;
    async function loadLatestJob() {
      try {
        const res = await fetch(`${crossApiBase}/api/fill/latest?issueId=${selectedIssueId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        const job = normalizeFillJob(data);
        if (job) setFillJob(job);
      } catch {
        // ignore job load errors
      }
    }
    loadLatestJob();
    return () => {
      active = false;
    };
  }, [crossApiBase, normalizeFillJob, selectedIssueId]);

  const liveJobId = fillJob?.id ?? null;
  const liveJobActive = fillJob?.status === "queued" || fillJob?.status === "running" || fillJob?.status === "review";

  useEffect(() => {
    if (!liveJobId || !liveJobActive) return;
    const es = new EventSource(`${crossApiBase}/api/fill/${liveJobId}/stream`);
    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const data = normalizeFillJob(parsed);
        if (data) setFillJob(data);
      } catch {
        // ignore malformed event payloads
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.close();
    };
  }, [crossApiBase, liveJobActive, liveJobId, normalizeFillJob]);

  useEffect(() => {
    if (!liveJobId || !liveJobActive) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`${crossApiBase}/api/fill/${liveJobId}`);
        if (!res.ok || !active) return;
        const data = await res.json();
        const job = normalizeFillJob(data);
        if (job) setFillJob(job);
      } catch {
        // ignore polling errors
      }
    };
    const interval = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [crossApiBase, liveJobActive, liveJobId, normalizeFillJob]);

  useEffect(() => {
    if (!fillJob?.id || fillJob.status !== "review") return;
    if (loadedReviewJobIdRef.current === fillJob.id && reviewData) return;
    let active = true;
    setReviewLoading(true);
    setReviewError(null);
    const load = async () => {
      try {
        const res = await fetch(`${crossApiBase}/api/fill/${fillJob.id}/review`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        if (!active) return;
        const normalized = normalizeReviewPayload(data);
        if (!normalized) {
          throw new Error("Invalid review payload");
        }
        const definitionIds = collectDefinitionOptionIdsFromPayload(normalized);
        const difficultyById = await ensureDefinitionDifficulties(definitionIds);
        if (!active) return;
        const normalizedWithDifficulties = normalizeReviewPayloadWithDifficulties(normalized, difficultyById);
        loadedReviewJobIdRef.current = fillJob.id;
        setReviewData(normalizedWithDifficulties);
        if (!isReviewDismissed(fillJob.id)) {
          setReviewOpenState(true);
        }
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : t("scanwordsReviewLoadError");
        setReviewError(msg);
        toast.error(msg);
      } finally {
        if (active) setReviewLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    crossApiBase,
    ensureDefinitionDifficulties,
    fillJob?.id,
    fillJob?.status,
    isReviewDismissed,
    normalizeReviewPayload,
    reviewData,
    t,
  ]);

  useEffect(() => {
    if (!fillJob?.templates) return;
    const withOrder = [...fillJob.templates];
    withOrder.sort((a, b) => {
      const aErr = a.status === "error";
      const bErr = b.status === "error";
      if (aErr !== bErr) return aErr ? -1 : 1;
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
    setTemplateList(withOrder);
  }, [fillJob?.templates]);

  const fillOverrides = useMemo<FillOverrides>(() => {
    const normalized = normalizeFillSettings(fillSettings);
    const preset = SPEED_PRESETS[normalized.speedPreset];
    const parallel = Math.min(PARALLEL_MAX, Math.max(PARALLEL_MIN, normalized.parallel));
    const restarts = parallel;
    const filterTemplateId =
      typeof selectedTemplateId === "number" && Number.isFinite(selectedTemplateId) && selectedTemplateId > 0
        ? Math.floor(selectedTemplateId)
        : undefined;
    return {
      maxNodes: preset.maxNodes,
      parallelRestarts: restarts,
      restarts,
      shuffle: true,
      unique: true,
      lcv: true,
      style: "corel",
      explainFail: true,
      noDefs: true,
      requireNative: true,
      usageStats: normalized.usageStats,
      ...(filterTemplateId !== undefined ? { filterTemplateId } : {}),
    };
  }, [fillSettings, selectedTemplateId]);

  const draftOptions = useMemo<FillDraftOptions>(() => {
    const normalized = normalizeFillSettings(settingsDraft);
    const preset = SPEED_PRESETS[normalized.speedPreset];
    const parallel = Math.min(PARALLEL_MAX, Math.max(PARALLEL_MIN, normalized.parallel));
    const restarts = parallel;
    return {
      speedPreset: normalized.speedPreset,
      parallel,
      maxNodes: preset.maxNodes,
      restarts,
      usageStats: normalized.usageStats,
    };
  }, [settingsDraft]);

  const speedOptions = useMemo<FillSpeedOption[]>(
    () =>
      (["fast", "medium", "slow"] as const).map((value) => ({
        value,
        label: t(
          value === "fast"
            ? "scanwordsFillSpeedFast"
            : value === "medium"
              ? "scanwordsFillSpeedMedium"
              : "scanwordsFillSpeedSlow",
        ),
        maxNodes: SPEED_PRESETS[value].maxNodes,
      })),
    [t],
  );

  const fillStatusLabelByValue = useCallback(
    (status: FillJobStatus | null | undefined) => {
      switch (status) {
        case "queued":
          return t("scanwordsFillQueued");
        case "running":
          return t("scanwordsFillRunning");
        case "review":
          return t("scanwordsFillReview");
        case "done":
          return t("scanwordsFillDone");
        case "error":
          return t("scanwordsFillError");
        default:
          return "";
      }
    },
    [t],
  );

  const templateStatusLabel = useCallback(
    (status: FillTemplateStatus["status"]) => {
      switch (status) {
        case "running":
          return t("scanwordsTemplateRunning");
        case "done":
          return t("scanwordsTemplateDone");
        case "error":
          return t("scanwordsTemplateError");
        default:
          return t("scanwordsTemplatePending");
      }
    },
    [t],
  );

  const templateErrorText = useCallback(
    (error?: string | null) => {
      if (!error) return null;
      const raw = String(error);
      const normalized = raw.trim().toLowerCase();
      if (normalized === "no-solution") return t("scanwordsFillErrorNoSolution");
      if (normalized === "forward-check") return t("scanwordsFillErrorForwardCheck");
      if (normalized === "zero-pick") return t("scanwordsFillErrorZeroPick");
      if (normalized.startsWith("aborted")) {
        const match = raw.match(/\(([^)]+)\)/);
        const reason = match?.[1]?.trim();
        return reason ? t("scanwordsFillErrorAbortedReason", { reason }) : t("scanwordsFillErrorAborted");
      }
      return raw;
    },
    [t],
  );

  const handleSettingsOpen = useCallback(() => {
    setSettingsDraft(fillSettings);
    setSettingsOpen(true);
  }, [fillSettings]);

  const handleSpeedPresetChange = useCallback((value: FillSpeedPreset) => {
    setSettingsDraft((prev) => ({ ...prev, speedPreset: value }));
  }, []);

  const handleSettingsSave = useCallback(async () => {
    setSettingsSaving(true);
    try {
      const normalized = normalizeFillSettings(settingsDraft);
      const saved = await saveScanwordFillSettingsAction(normalized);
      const applied = normalizeFillSettings({ ...(saved ?? {}), usageStats: normalized.usageStats });
      setFillSettings(applied);
      setSettingsDraft(applied);
      writeStoredUsageStats(applied.usageStats);
      setSettingsOpen(false);
      toast.success(t("scanwordsFillSettingsSaved"));
    } catch {
      toast.error(t("scanwordsFillSettingsError"));
    } finally {
      setSettingsSaving(false);
    }
  }, [settingsDraft, t]);

  const handleParallelChange = useCallback((value: string) => {
    const next = Number.parseInt(value, 10);
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(PARALLEL_MAX, Math.max(PARALLEL_MIN, next));
    setSettingsDraft((prev) => ({ ...prev, parallel: clamped }));
  }, []);

  const handleUsageStatsChange = useCallback((checked: boolean) => {
    setSettingsDraft((prev) => ({ ...prev, usageStats: checked }));
  }, []);

  const openArchivesDialog = useCallback(async () => {
    if (!selectedIssueId) return;
    setArchivesDialogOpen(true);
    setArchivesLoading(true);
    setArchivesError(null);
    try {
      const data = await getScanwordFillArchivesAction({ issueId: selectedIssueId });
      setArchives(data);
    } catch {
      setArchives([]);
      setArchivesError(t("scanwordsFillArchiveHistoryError"));
    } finally {
      setArchivesLoading(false);
    }
  }, [selectedIssueId, t]);

  const handleLatestArchiveOnlyChange = useCallback(
    (checked: boolean) => {
      setLatestArchiveOnly(checked);
      if (!checked) {
        void openArchivesDialog();
      }
    },
    [openArchivesDialog],
  );

  const handleFillStart = useCallback(async () => {
    if (!selectedIssueId) return;
    setFillStarting(true);
    setFillError(null);
    try {
      const res = await fetch(`${crossApiBase}/api/fill/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: selectedIssueId, options: fillOverrides }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const job = normalizeFillJob(data);
      if (job) setFillJob(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("scanwordsFillStartError");
      setFillError(msg);
      toast.error(t("scanwordsFillStartError"));
    } finally {
      setFillStarting(false);
    }
  }, [crossApiBase, fillOverrides, normalizeFillJob, selectedIssueId, t]);

  const requestWordCandidates = useCallback(
    async (params: {
      templateKey: string;
      slotId: number;
      mask: string;
      limit?: number;
    }): Promise<FillMaskCandidate[]> => {
      if (!fillJob?.id) return [];
      const res = await fetch(`${crossApiBase}/api/fill/${fillJob.id}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const candidates = Array.isArray(data?.candidates) ? (data.candidates as FillMaskCandidate[]) : [];
      const definitionIds = collectDefinitionOptionIdsFromCandidates(candidates);
      const difficultyById = await ensureDefinitionDifficulties(definitionIds);
      return normalizeCandidatesWithDifficulties(candidates, difficultyById);
    },
    [crossApiBase, ensureDefinitionDifficulties, fillJob?.id],
  );

  const finalizeReview = useCallback(
    async (payload: FillFinalizePayload) => {
      if (!fillJob?.id) return;
      setReviewFinalizing(true);
      setReviewError(null);
      try {
        const res = await fetch("/api/scanwords/fill/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: fillJob.id,
            payload,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        const nextJob = normalizeFillJob(data);
        if (nextJob) {
          setFillJob(nextJob);
          if (nextJob.status !== "review") {
            setReviewOpenState(false);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("scanwordsReviewFinalizeError");
        setReviewError(msg);
        toast.error(msg);
        throw err;
      } finally {
        setReviewFinalizing(false);
      }
    },
    [fillJob?.id, normalizeFillJob, t],
  );

  const fillStatus = fillJob?.status ?? null;
  const fillProgress = fillJob?.progress ?? 0;
  const fillCompleted = fillJob?.completedTemplates ?? null;
  const fillTotal = fillJob?.totalTemplates ?? null;
  const fillStatusLabel = fillStatusLabelByValue(fillStatus);
  const archiveUrl =
    fillJob && fillJob.status === "done" && fillJob.archiveReady
      ? `${crossApiBase}/api/fill/${fillJob.id}/archive`
      : null;

  return {
    fillJob,
    fillStatus,
    fillStatusLabel,
    fillProgress,
    fillCompleted,
    fillTotal,
    fillStarting,
    fillError,
    archiveUrl,
    reviewOpen,
    setReviewOpen,
    reviewLoading,
    reviewFinalizing,
    reviewError,
    reviewData,
    requestWordCandidates,
    finalizeReview,
    fillSettings,
    settingsDraft,
    settingsOpen,
    settingsSaving,
    latestArchiveOnly,
    archivesDialogOpen,
    setArchivesDialogOpen,
    archivesLoading,
    archivesError,
    archives,
    templateList,
    speedOptions,
    draftOptions,
    handleSettingsOpen,
    setSettingsOpen,
    handleSpeedPresetChange,
    handleParallelChange,
    handleUsageStatsChange,
    handleSettingsSave,
    openArchivesDialog,
    handleLatestArchiveOnlyChange,
    handleFillStart,
    fillStatusLabelByValue,
    templateStatusLabel,
    templateErrorText,
  };
}
