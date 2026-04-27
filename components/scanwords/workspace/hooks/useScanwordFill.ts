"use client";

import type { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getScanwordFillArchivesAction,
  getScanwordFillSettingsAction,
  getScanwordIssueSvgSettingsAction,
  listScanwordSvgFontsAction,
  saveScanwordFillSettingsAction,
  saveScanwordIssueSvgSettingsAction,
} from "@/app/actions/scanwords";
import { getActionErrorMeta } from "@/lib/action-error";
import {
  DEFAULT_FILL_SETTINGS,
  type FillArchiveItem,
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
  SPEED_PRESETS,
  type SvgFontItem,
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
const FILL_START_TIMEOUT_MS = 15_000;
const HTTP_STATUS_MESSAGE_RE = /^HTTP\s+\d{3}$/i;

function buildReviewDismissStorageKey(jobId: string): string {
  return `scanwords:fillReviewDismissed:${jobId}`;
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

async function fetchJsonWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; data: unknown }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const rawText = await response.text();
    if (!rawText) return { response, data: {} };
    try {
      return { response, data: JSON.parse(rawText) };
    } catch {
      return { response, data: { error: rawText } };
    }
  } finally {
    clearTimeout(timeoutId);
  }
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

function extractApiErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    if (error instanceof Error) {
      const message = error.message.trim();
      if (message && !HTTP_STATUS_MESSAGE_RE.test(message)) return message;
    }
    return null;
  }

  const withPayload = error as { payload?: unknown; message?: unknown };
  const payload = withPayload.payload;
  if (payload && typeof payload === "object") {
    const payloadObj = payload as { message?: unknown; error?: unknown };
    const payloadMessage =
      typeof payloadObj.message === "string" && payloadObj.message.trim().length > 0
        ? payloadObj.message.trim()
        : typeof payloadObj.error === "string" && payloadObj.error.trim().length > 0
          ? payloadObj.error.trim()
          : null;
    if (payloadMessage) return payloadMessage;
  }

  if (typeof withPayload.message === "string" && withPayload.message.trim().length > 0) {
    const message = withPayload.message.trim();
    if (!HTTP_STATUS_MESSAGE_RE.test(message)) return message;
  }

  return null;
}

function normalizeDefinitionLimitInput(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  if (normalized < 1) return 1;
  if (normalized > 1024) return 1024;
  return normalized;
}

function normalizeSvgFontPtInput(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < 1) return 1;
  if (value > 72) return 72;
  return Math.round(value * 1000) / 1000;
}

function normalizeSvgTypographyPercentInput(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  if (normalized < 40) return 40;
  if (normalized > 200) return 200;
  return normalized;
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
  const [svgFonts, setSvgFonts] = useState<SvgFontItem[]>([]);
  const [svgFontsLoading, setSvgFontsLoading] = useState(false);
  const [fontUploading, setFontUploading] = useState(false);
  const [latestArchiveOnly, setLatestArchiveOnly] = useState(true);
  const [archivesDialogOpen, setArchivesDialogOpen] = useState(false);
  const [archivesLoading, setArchivesLoading] = useState(false);
  const [archivesError, setArchivesError] = useState<string | null>(null);
  const [archives, setArchives] = useState<FillArchiveItem[]>([]);
  const [latestAvailableArchiveUrl, setLatestAvailableArchiveUrl] = useState<string | null>(null);
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
    setFillSettings(DEFAULT_FILL_SETTINGS);
    setSettingsDraft(DEFAULT_FILL_SETTINGS);
    setSvgFonts([]);
    setSvgFontsLoading(false);
    setFontUploading(false);
    setLatestArchiveOnly(true);
    setArchivesDialogOpen(false);
    setArchivesLoading(false);
    setArchivesError(null);
    setArchives([]);
    setLatestAvailableArchiveUrl(null);
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
      if (!selectedIssueId) {
        if (!active) return;
        setFillSettings(DEFAULT_FILL_SETTINGS);
        setSettingsDraft(DEFAULT_FILL_SETTINGS);
        setSvgFonts([]);
        setSvgFontsLoading(false);
        return;
      }
      setSvgFontsLoading(true);
      try {
        const [savedFill, savedSvg, fonts] = await Promise.all([
          getScanwordFillSettingsAction({ issueId: selectedIssueId }),
          getScanwordIssueSvgSettingsAction({ issueId: selectedIssueId }),
          listScanwordSvgFontsAction(),
        ]);
        if (!active) return;
        const normalized = normalizeFillSettings({
          ...(savedFill ?? {}),
          ...(savedSvg ?? {}),
        });
        setFillSettings(normalized);
        setSettingsDraft(normalized);
        setSvgFonts(fonts);
      } catch {
        if (!active) return;
        setFillSettings(DEFAULT_FILL_SETTINGS);
        setSettingsDraft(DEFAULT_FILL_SETTINGS);
        setSvgFonts([]);
      } finally {
        if (active) setSvgFontsLoading(false);
      }
    }
    void loadSettings();
    return () => {
      active = false;
    };
  }, [selectedIssueId]);

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

  useEffect(() => {
    if (!selectedIssueId) {
      setLatestAvailableArchiveUrl(null);
      return;
    }
    if (fillJob?.archiveReady) {
      setLatestAvailableArchiveUrl(null);
      return;
    }
    let active = true;
    const loadLatestArchiveUrl = async () => {
      try {
        const list = await getScanwordFillArchivesAction({ issueId: selectedIssueId });
        if (!active) return;
        const first = list[0] ?? null;
        if (!first) {
          setLatestAvailableArchiveUrl(null);
          return;
        }
        const href = first.archiveFileName
          ? `${crossApiBase}/api/fill/${first.id}/archive?file=${encodeURIComponent(first.archiveFileName)}`
          : `${crossApiBase}/api/fill/${first.id}/archive`;
        setLatestAvailableArchiveUrl(href);
      } catch {
        if (active) setLatestAvailableArchiveUrl(null);
      }
    };
    void loadLatestArchiveUrl();
    return () => {
      active = false;
    };
  }, [crossApiBase, fillJob?.archiveReady, selectedIssueId]);

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
          throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, payload: data });
        }
        if (!active) return;
        const normalized = normalizeReviewPayload(data);
        if (!normalized) {
          throw Object.assign(new Error("Invalid review payload"), { status: 500 });
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
        const { status } = getActionErrorMeta(err);
        const message = status === 403 ? t("forbidden") : t("scanwordsReviewLoadError");
        setReviewError(message);
        toast.error(message);
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
    const filterTemplateId =
      typeof selectedTemplateId === "number" && Number.isFinite(selectedTemplateId) && selectedTemplateId > 0
        ? Math.floor(selectedTemplateId)
        : undefined;
    return {
      maxNodes: preset.maxNodes,
      shuffle: true,
      unique: true,
      lcv: true,
      style: "corel",
      explainFail: true,
      noDefs: true,
      requireNative: true,
      ...(filterTemplateId !== undefined ? { filterTemplateId } : {}),
    };
  }, [fillSettings, selectedTemplateId]);

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

  const handleDefinitionMaxPerCellChange = useCallback((value: number) => {
    setSettingsDraft((prev) => {
      const nextCell = normalizeDefinitionLimitInput(value, prev.definitionMaxPerCell);
      return {
        ...prev,
        definitionMaxPerCell: nextCell,
        definitionMaxPerHalfCell: Math.min(prev.definitionMaxPerHalfCell, nextCell),
      };
    });
  }, []);

  const handleDefinitionMaxPerHalfCellChange = useCallback((value: number) => {
    setSettingsDraft((prev) => {
      const nextHalf = normalizeDefinitionLimitInput(value, prev.definitionMaxPerHalfCell);
      return {
        ...prev,
        definitionMaxPerHalfCell: Math.min(nextHalf, prev.definitionMaxPerCell),
      };
    });
  }, []);

  const handleClueFontBasePtChange = useCallback((value: number) => {
    setSettingsDraft((prev) => {
      const nextBase = normalizeSvgFontPtInput(value, prev.clueFontBasePt);
      return {
        ...prev,
        clueFontBasePt: nextBase,
        clueFontMinPt: Math.min(prev.clueFontMinPt, nextBase),
      };
    });
  }, []);

  const handleClueFontMinPtChange = useCallback((value: number) => {
    setSettingsDraft((prev) => {
      const nextMin = normalizeSvgFontPtInput(value, prev.clueFontMinPt);
      return {
        ...prev,
        clueFontMinPt: Math.min(nextMin, prev.clueFontBasePt),
      };
    });
  }, []);

  const handleClueGlyphWidthPctChange = useCallback((value: number) => {
    setSettingsDraft((prev) => ({
      ...prev,
      clueGlyphWidthPct: normalizeSvgTypographyPercentInput(value, prev.clueGlyphWidthPct),
    }));
  }, []);

  const handleClueLineHeightPctChange = useCallback((value: number) => {
    setSettingsDraft((prev) => ({
      ...prev,
      clueLineHeightPct: normalizeSvgTypographyPercentInput(value, prev.clueLineHeightPct),
    }));
  }, []);

  const handleSvgFontIdChange = useCallback((value: string) => {
    setSettingsDraft((prev) => ({
      ...prev,
      svgFontId: value === "__none__" ? null : value,
    }));
  }, []);

  const handleSvgSystemFontFamilyChange = useCallback((value: string) => {
    setSettingsDraft((prev) => ({
      ...prev,
      svgSystemFontFamily: value,
    }));
  }, []);

  const handleUploadSvgFont = useCallback(
    async (file: File) => {
      setFontUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file, file.name);
        const response = await fetch("/api/upload/fonts", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw Object.assign(new Error(`HTTP ${response.status}`), {
            status: response.status,
            payload,
          });
        }
        const font = payload?.font as SvgFontItem | undefined;
        const refreshedFonts = await listScanwordSvgFontsAction();
        setSvgFonts(refreshedFonts);
        if (font?.id) {
          setSettingsDraft((prev) => ({
            ...prev,
            svgFontId: font.id,
            svgSystemFontFamily: prev.svgSystemFontFamily?.trim().length
              ? prev.svgSystemFontFamily
              : (font.familyName ?? prev.svgSystemFontFamily),
          }));
        }
        toast.success(t("scanwordsSvgFontUploadSuccess"));
      } catch {
        toast.error(t("scanwordsSvgFontUploadError"));
      } finally {
        setFontUploading(false);
      }
    },
    [t],
  );

  const handleSettingsSave = useCallback(async () => {
    if (!selectedIssueId) return;
    setSettingsSaving(true);
    try {
      const normalized = normalizeFillSettings(settingsDraft);
      const [savedFill, savedSvg] = await Promise.all([
        saveScanwordFillSettingsAction({
          issueId: selectedIssueId,
          speedPreset: normalized.speedPreset,
          definitionMaxPerCell: normalized.definitionMaxPerCell,
          definitionMaxPerHalfCell: Math.min(normalized.definitionMaxPerHalfCell, normalized.definitionMaxPerCell),
        }),
        saveScanwordIssueSvgSettingsAction({
          issueId: selectedIssueId,
          clueFontBasePt: normalized.clueFontBasePt,
          clueFontMinPt: normalized.clueFontMinPt,
          clueGlyphWidthPct: normalized.clueGlyphWidthPct,
          clueLineHeightPct: normalized.clueLineHeightPct,
          fontId: normalized.svgFontId,
          systemFontFamily: normalized.svgSystemFontFamily,
        }),
      ]);
      const applied = normalizeFillSettings({
        ...(savedFill ?? {}),
        ...(savedSvg ?? {}),
      });
      setFillSettings(applied);
      setSettingsDraft(applied);
      setSettingsOpen(false);
      toast.success(t("scanwordsFillSettingsSaved"));
    } catch {
      toast.error(t("scanwordsFillSettingsError"));
    } finally {
      setSettingsSaving(false);
    }
  }, [selectedIssueId, settingsDraft, t]);

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
      const { response, data } = await fetchJsonWithTimeout(
        `${crossApiBase}/api/fill/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueId: selectedIssueId, options: fillOverrides }),
        },
        FILL_START_TIMEOUT_MS,
      );
      if (!response.ok) {
        throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status, payload: data });
      }
      const job = normalizeFillJob(data);
      if (job) setFillJob(job);
    } catch (err) {
      const { status } = getActionErrorMeta(err);
      const message = status === 403 ? t("forbidden") : t("scanwordsFillStartError");
      setFillError(message);
      toast.error(message);
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
        throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, payload: data });
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
            payload: {
              ...payload,
              definitionLimits: {
                maxPerCell: fillSettings.definitionMaxPerCell,
                maxPerHalfCell: fillSettings.definitionMaxPerHalfCell,
              },
              svgTypography: {
                clueFontBasePt: fillSettings.clueFontBasePt,
                clueFontMinPt: fillSettings.clueFontMinPt,
                clueGlyphWidthPct: fillSettings.clueGlyphWidthPct,
                clueLineHeightPct: fillSettings.clueLineHeightPct,
                fontId: fillSettings.svgFontId,
                systemFontFamily: fillSettings.svgSystemFontFamily,
              },
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, payload: data });
        }
        const nextJob = normalizeFillJob(data);
        if (nextJob) {
          setFillJob(nextJob);
          if (nextJob.status !== "review") {
            setReviewOpenState(false);
          }
        }
      } catch (err) {
        const { status } = getActionErrorMeta(err);
        const apiMessage = extractApiErrorMessage(err);
        const message = status === 403 ? t("forbidden") : (apiMessage ?? t("scanwordsReviewFinalizeError"));
        setReviewError(message);
        toast.error(message);
        throw err;
      } finally {
        setReviewFinalizing(false);
      }
    },
    [
      fillJob?.id,
      fillSettings.definitionMaxPerCell,
      fillSettings.definitionMaxPerHalfCell,
      fillSettings.clueFontBasePt,
      fillSettings.clueFontMinPt,
      fillSettings.clueGlyphWidthPct,
      fillSettings.clueLineHeightPct,
      fillSettings.svgFontId,
      fillSettings.svgSystemFontFamily,
      normalizeFillJob,
      t,
    ],
  );

  const fillStatus = fillJob?.status ?? null;
  const fillProgress = fillJob?.progress ?? 0;
  const fillCompleted = fillJob?.completedTemplates ?? null;
  const fillTotal = fillJob?.totalTemplates ?? null;
  const fillStatusLabel = fillStatusLabelByValue(fillStatus);
  const archiveUrl = fillJob?.archiveReady
    ? `${crossApiBase}/api/fill/${fillJob.id}/archive`
    : latestAvailableArchiveUrl;

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
    svgFonts,
    svgFontsLoading,
    fontUploading,
    latestArchiveOnly,
    archivesDialogOpen,
    setArchivesDialogOpen,
    archivesLoading,
    archivesError,
    archives,
    templateList,
    speedOptions,
    handleSettingsOpen,
    setSettingsOpen,
    handleSpeedPresetChange,
    handleDefinitionMaxPerCellChange,
    handleDefinitionMaxPerHalfCellChange,
    handleClueFontBasePtChange,
    handleClueFontMinPtChange,
    handleClueGlyphWidthPctChange,
    handleClueLineHeightPctChange,
    handleSvgFontIdChange,
    handleSvgSystemFontFamilyChange,
    handleUploadSvgFont,
    handleSettingsSave,
    openArchivesDialog,
    handleLatestArchiveOnlyChange,
    handleFillStart,
    fillStatusLabelByValue,
    templateStatusLabel,
    templateErrorText,
  };
}
