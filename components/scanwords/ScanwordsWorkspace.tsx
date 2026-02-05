"use client";

import { CircleAlert, CircleCheckBig, Settings, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getScanwordFillSettingsAction,
  getScanwordUploadSnapshotAction,
  saveScanwordFillSettingsAction,
  saveScanwordUploadSnapshotAction,
} from "@/app/actions/scanwords";
import { FilterStatsSummary } from "@/components/dictionary/FilterStatsSummary";
import { TemplatePicker } from "@/components/dictionary/TemplatePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { UploadFileInfo, UploadPanelHandle, UploadParseError } from "@/components/upload/UploadPanel";
import { UploadPanel } from "@/components/upload/UploadPanel";
import { cn } from "@/lib/utils";
import type { DictionaryTemplateItem, FilterStats } from "@/types/dictionary-templates";
import type { Edition, Issue } from "./types";

type WorkspaceTab = "dictionary" | "upload" | "conflicts" | "generation";

type FillJobStatus = "queued" | "running" | "done" | "error";

type FillTemplateStatus = {
  key?: string | null;
  name: string;
  status: "pending" | "running" | "done" | "error";
  error?: string | null;
  order?: number | null;
  sourceName?: string | null;
};

type FillJobState = {
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

type FillSpeedPreset = "fast" | "medium" | "slow";

type FillSettings = {
  speedPreset: FillSpeedPreset;
  parallel: number;
};

type FillSettingsInput = {
  speedPreset?: string;
  parallel?: number;
} | null;

const SPEED_PRESETS: Record<FillSpeedPreset, { maxNodes: number; restartsMultiplier: number }> = {
  fast: { maxNodes: 2_000_000, restartsMultiplier: 2 },
  medium: { maxNodes: 4_000_000, restartsMultiplier: 3 },
  slow: { maxNodes: 8_000_000, restartsMultiplier: 4 },
};

const PARALLEL_MIN = 1;
const PARALLEL_MAX = 32;
const DEFAULT_FILL_SETTINGS: FillSettings = { speedPreset: "fast", parallel: 2 };

function normalizeFillSettings(input?: FillSettingsInput): FillSettings {
  const speed = input?.speedPreset;
  const speedPreset: FillSpeedPreset =
    speed === "fast" || speed === "medium" || speed === "slow" ? speed : DEFAULT_FILL_SETTINGS.speedPreset;
  const parallelRaw = typeof input?.parallel === "number" ? input.parallel : DEFAULT_FILL_SETTINGS.parallel;
  const parallel = Math.min(PARALLEL_MAX, Math.max(PARALLEL_MIN, Math.round(parallelRaw)));
  return { speedPreset, parallel };
}

type ScanwordsWorkspaceProps = {
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

export function ScanwordsWorkspace(props: ScanwordsWorkspaceProps) {
  const {
    selectedEdition,
    selectedIssue,
    templates,
    selectedTemplateId,
    templatesLoading,
    templatesError,
    stats,
    statsLoading,
    statsError,
    onTemplateSelect,
  } = props;
  const t = useTranslations();
  const f = useFormatter();
  const crossApiBase = (process.env.NEXT_PUBLIC_CROSS_API_URL || "http://localhost:3001").replace(/\/$/, "");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("dictionary");
  const [selectedFilesCount, setSelectedFilesCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadTotals, setUploadTotals] = useState<Record<string, number> | null>(null);
  const [lastUploadTotals, setLastUploadTotals] = useState<Record<string, number> | null>(null);
  const [parseErrors, setParseErrors] = useState<UploadParseError[]>([]);
  const [currentFiles, setCurrentFiles] = useState<UploadFileInfo[]>([]);
  const [lastUploadCount, setLastUploadCount] = useState(0);
  const [lastUploadErrors, setLastUploadErrors] = useState<UploadParseError[]>([]);
  const [_lastUploadFiles, setLastUploadFiles] = useState<UploadFileInfo[]>([]);
  const [uploadClicked, setUploadClicked] = useState(false);
  const [fillJob, setFillJob] = useState<FillJobState | null>(null);
  const [fillStarting, setFillStarting] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const [fillSettings, setFillSettings] = useState<FillSettings>(DEFAULT_FILL_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<FillSettings>(DEFAULT_FILL_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [templateList, setTemplateList] = useState<FillTemplateStatus[]>([]);
  const lastUploadRef = useRef<{
    count: number;
    files: UploadFileInfo[];
    errors: UploadParseError[];
    neededStats: Record<string, number> | null;
  }>({
    count: 0,
    files: [],
    errors: [],
    neededStats: null,
  });
  const uploadPanelRef = useRef<UploadPanelHandle | null>(null);
  const prevTemplateIdRef = useRef<number | null | undefined>(undefined);
  const prevFilesSignatureRef = useRef<string | undefined>(undefined);
  const selectedIssueId = selectedIssue?.id ?? null;
  const tabStorageKey = selectedIssueId ? `scanwords:workspaceTab:${selectedIssueId}` : null;

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const normalizeFillJob = useCallback((raw: unknown): FillJobState | null => {
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Partial<FillJobState> & { id?: string | number; status?: string; progress?: number };
    if (!data.id) return null;
    const status =
      data.status === "queued" || data.status === "running" || data.status === "done" || data.status === "error"
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

  const resetFillState = useCallback(() => {
    setFillJob(null);
    setFillStarting(false);
    setFillError(null);
    setTemplateList([]);
  }, []);

  const filesSignature = useMemo(
    () => currentFiles.map((file) => file.key ?? `${file.name}:${file.size}`).join("|"),
    [currentFiles],
  );

  useEffect(() => {
    if (!selectedIssueId) return;
    const saved = typeof window !== "undefined" && tabStorageKey ? window.localStorage.getItem(tabStorageKey) : null;
    const normalized: WorkspaceTab =
      saved === "dictionary" || saved === "upload" || saved === "conflicts" || saved === "generation"
        ? saved
        : "dictionary";
    setActiveTab(normalized);
    setSelectedFilesCount(0);
    setUploading(false);
    setUploadTotals(null);
    setLastUploadTotals(null);
    setParseErrors([]);
    setCurrentFiles([]);
    setLastUploadCount(0);
    setLastUploadErrors([]);
    setLastUploadFiles([]);
    setUploadClicked(false);
    setFillJob(null);
    setFillStarting(false);
    setFillError(null);
    setTemplateList([]);
  }, [selectedIssueId, tabStorageKey]);

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
      if (currentFiles.length > 0) {
        setUploadClicked(false);
      } else {
        setUploadClicked(lastUploadCount > 0);
      }
    }
  }, [currentFiles.length, filesSignature, lastUploadCount, resetFillState]);

  useEffect(() => {
    if (!selectedIssueId || !tabStorageKey) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(tabStorageKey, activeTab);
  }, [activeTab, selectedIssueId, tabStorageKey]);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const saved = await getScanwordFillSettingsAction();
        if (!active || !saved) return;
        const normalized = normalizeFillSettings(saved);
        setFillSettings(normalized);
        setSettingsDraft(normalized);
      } catch {
        // ignore settings load errors in UI
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const liveFilesCount = Math.max(selectedFilesCount, currentFiles.length);
  const hasLiveFiles = liveFilesCount > 0;

  useEffect(() => {
    if (!hasLiveFiles && lastUploadCount === 0) {
      setUploadClicked(false);
    }
  }, [hasLiveFiles, lastUploadCount]);

  useEffect(() => {
    if (!selectedIssueId) return;
    const issueId = selectedIssueId;
    let active = true;
    async function loadSnapshot() {
      try {
        const snapshot = await getScanwordUploadSnapshotAction({ issueId });
        if (!active || !snapshot) return;
        setLastUploadCount(snapshot.fileCount);
        setLastUploadErrors(snapshot.errors);
        setLastUploadFiles(snapshot.files);
        setLastUploadTotals(snapshot.neededStats ?? null);
        lastUploadRef.current = {
          count: snapshot.fileCount,
          files: snapshot.files,
          errors: snapshot.errors,
          neededStats: snapshot.neededStats ?? null,
        };
        if (snapshot.fileCount > 0) {
          setUploadClicked(true);
        }
      } catch {
        // ignore snapshot load errors in UI
      }
    }
    loadSnapshot();
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

  const liveJobId = fillJob?.id ?? null;
  const liveJobActive = fillJob?.status === "queued" || fillJob?.status === "running";

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

  const fillOverrides = useMemo(() => {
    const normalized = normalizeFillSettings(fillSettings);
    const preset = SPEED_PRESETS[normalized.speedPreset];
    const parallel = Math.min(PARALLEL_MAX, Math.max(PARALLEL_MIN, normalized.parallel));
    const restarts = Math.max(parallel, parallel * preset.restartsMultiplier);
    return {
      maxNodes: preset.maxNodes,
      parallelRestarts: parallel,
      restarts,
    };
  }, [fillSettings]);

  const draftOptions = useMemo(() => {
    const normalized = normalizeFillSettings(settingsDraft);
    const preset = SPEED_PRESETS[normalized.speedPreset];
    const parallel = Math.min(PARALLEL_MAX, Math.max(PARALLEL_MIN, normalized.parallel));
    const restarts = Math.max(parallel, parallel * preset.restartsMultiplier);
    return {
      speedPreset: normalized.speedPreset,
      parallel,
      maxNodes: preset.maxNodes,
      restarts,
    };
  }, [settingsDraft]);

  const speedOptions = useMemo(
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

  const dictionaryComplete = selectedTemplateId != null;
  const effectiveUploadCount = hasLiveFiles ? liveFilesCount : lastUploadCount;
  const effectiveErrors = hasLiveFiles ? parseErrors : lastUploadErrors;
  const effectiveTotals = hasLiveFiles ? uploadTotals : lastUploadTotals;
  const uploadHasFiles = effectiveUploadCount > 0;
  const uploadHasErrors = effectiveErrors.length > 0;
  const uploadStepComplete = uploadHasFiles;
  const conflictsStepComplete = uploadClicked;
  const fillStatus = fillJob?.status ?? null;
  const generationStepComplete = fillStatus === "done" || fillStatus === "error";
  const showParseErrors = hasLiveFiles ? parseErrors.length > 0 : lastUploadErrors.length > 0;
  const visibleParseErrors = hasLiveFiles ? parseErrors : lastUploadErrors;
  const completedSteps =
    (dictionaryComplete ? 1 : 0) +
    (uploadStepComplete ? 1 : 0) +
    (conflictsStepComplete ? 1 : 0) +
    (generationStepComplete ? 1 : 0);
  const totalSteps = 4;
  const progressSteps = [1, 2, 3, 4];
  const fillReady = dictionaryComplete && uploadHasFiles && !uploadHasErrors && uploadClicked;
  const fillProgress = fillJob?.progress ?? 0;
  const fillCompleted = fillJob?.completedTemplates ?? null;
  const fillTotal = fillJob?.totalTemplates ?? null;
  const fillStatusLabel =
    fillStatus === "queued"
      ? t("scanwordsFillQueued")
      : fillStatus === "running"
        ? t("scanwordsFillRunning")
        : fillStatus === "done"
          ? t("scanwordsFillDone")
          : fillStatus === "error"
            ? t("scanwordsFillError")
            : "";
  const fillCanStart = fillReady && !fillStarting && fillStatus !== "running" && fillStatus !== "queued";
  const archiveUrl =
    fillJob && fillJob.status === "done" && fillJob.archiveReady
      ? `${crossApiBase}/api/fill/${fillJob.id}/archive`
      : null;
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

  const neededCounts = useMemo(() => {
    if (!effectiveTotals) return [];
    return Object.entries(effectiveTotals)
      .filter(([key, value]) => key !== "total" && value > 0)
      .map(([key, value]) => ({ length: Number(key), count: value }))
      .filter((row) => Number.isFinite(row.length))
      .sort((a, b) => a.length - b.length);
  }, [effectiveTotals]);

  const dictionaryCounts = useMemo(() => {
    if (!stats?.lengthCounts?.length) return new Map<number, number>();
    return new Map(stats.lengthCounts.map((row) => [row.length, row.count]));
  }, [stats]);

  const conflictRows = useMemo(
    () =>
      neededCounts.map((row) => ({
        length: row.length,
        needed: row.count,
        available: dictionaryCounts.get(row.length) ?? 0,
      })),
    [dictionaryCounts, neededCounts],
  );

  const hasShortage = conflictRows.some((row) => row.available < row.needed);
  const hasExcess = conflictRows.some(
    (row) => row.available > row.needed && (row.available - row.needed) / row.needed < 0.2,
  );
  const conflictsHasIssues = uploadHasErrors || hasShortage || hasExcess;

  const handleUploadClick = useCallback(() => {
    const panelCount = uploadPanelRef.current?.getFilesCount() ?? 0;
    const count = Math.max(panelCount, liveFilesCount);
    const snapshot = {
      count,
      files: currentFiles,
      errors: parseErrors,
      neededStats: uploadTotals,
    };
    lastUploadRef.current = snapshot;
    void uploadPanelRef.current?.upload();
  }, [currentFiles, liveFilesCount, parseErrors, uploadTotals]);

  const handleUploadComplete = useCallback(async () => {
    if (!selectedIssueId) return;
    const snapshot = lastUploadRef.current;
    setLastUploadCount(snapshot.count);
    setLastUploadErrors(snapshot.errors);
    setLastUploadFiles(snapshot.files);
    setLastUploadTotals(snapshot.neededStats ?? null);
    setUploadClicked(snapshot.count > 0);
    try {
      await saveScanwordUploadSnapshotAction({
        issueId: selectedIssueId,
        templateId: selectedTemplateId ?? null,
        templateName: selectedTemplate?.name ?? null,
        fileCount: snapshot.count,
        files: snapshot.files,
        errors: snapshot.errors,
        neededStats: snapshot.neededStats ?? null,
      });
    } catch {
      // ignore save errors in UI
    }
  }, [selectedIssueId, selectedTemplate?.name, selectedTemplateId]);

  const handleSettingsOpen = useCallback(() => {
    setSettingsDraft(fillSettings);
    setSettingsOpen(true);
  }, [fillSettings]);

  const handleSettingsSave = useCallback(async () => {
    setSettingsSaving(true);
    try {
      const normalized = normalizeFillSettings(settingsDraft);
      const saved = await saveScanwordFillSettingsAction(normalized);
      const applied = normalizeFillSettings(saved);
      setFillSettings(applied);
      setSettingsDraft(applied);
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

  if (!selectedIssue) return null;

  return (
    <TooltipProvider>
      <section className="min-w-0 flex-1">
        <Card className="flex h-[calc(100vh-7rem)] flex-col bg-background/70">
          <CardHeader className="shrink-0 pb-4">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <Sparkles className="size-4 text-emerald-500" />
              {t("scanwordsWorkspace")}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {selectedEdition && <Badge variant="outline">{selectedEdition.name}</Badge>}
                <Badge variant="secondary">{selectedIssue.label}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col pt-2">
            <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("scanwordsProgress")}</span>
                <span>
                  {t("scanwordsProgressCount", {
                    completed: f.number(completedSteps),
                    total: f.number(totalSteps),
                  })}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t("scanwordsProgress")}
                aria-valuemin={0}
                aria-valuemax={totalSteps}
                aria-valuenow={completedSteps}
                className="flex gap-1"
              >
                {progressSteps.map((step) => {
                  let fillClass = "bg-muted";
                  if (step === 1 && dictionaryComplete) {
                    fillClass = "bg-emerald-500";
                  }
                  if (step === 2 && uploadStepComplete) {
                    fillClass = uploadHasErrors ? "bg-amber-500" : "bg-emerald-500";
                  }
                  if (step === 3 && conflictsStepComplete) {
                    fillClass = conflictsHasIssues ? "bg-amber-500" : "bg-emerald-500";
                  }
                  if (step === 4) {
                    if (fillStatus === "done") fillClass = "bg-emerald-500";
                    else if (fillStatus === "error") fillClass = "bg-destructive";
                    else if (fillStatus === "running" || fillStatus === "queued") fillClass = "bg-amber-500";
                  }
                  return <span key={step} className={cn("h-2 flex-1 rounded-full transition-colors", fillClass)} />;
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <Button
                  type="button"
                  variant={activeTab === "dictionary" ? "secondary" : "outline"}
                  className="w-full justify-between"
                  onClick={() => setActiveTab("dictionary")}
                  aria-pressed={activeTab === "dictionary"}
                >
                  <span className="truncate">{t("dictionary")}</span>
                  {dictionaryComplete && <CircleCheckBig className="size-4 text-emerald-500" aria-hidden />}
                </Button>
                <Button
                  type="button"
                  variant={activeTab === "upload" ? "secondary" : "outline"}
                  className="w-full justify-between"
                  onClick={() => setActiveTab("upload")}
                  aria-pressed={activeTab === "upload"}
                >
                  <span className="truncate">{t("upload")}</span>
                  {uploadStepComplete && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{t("scanwordsUploadCount", { count: f.number(effectiveUploadCount) })}</span>
                      {uploadHasErrors ? (
                        <CircleAlert className="size-4 text-amber-600" aria-hidden />
                      ) : (
                        <CircleCheckBig className="size-4 text-emerald-500" aria-hidden />
                      )}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant={activeTab === "conflicts" ? "secondary" : "outline"}
                  className="w-full justify-between"
                  onClick={() => setActiveTab("conflicts")}
                  aria-pressed={activeTab === "conflicts"}
                >
                  <span className="truncate">{t("scanwordsConflicts")}</span>
                  {conflictsStepComplete &&
                    (conflictsHasIssues ? (
                      <CircleAlert className="size-4 text-amber-600" aria-hidden />
                    ) : (
                      <CircleCheckBig className="size-4 text-emerald-500" aria-hidden />
                    ))}
                </Button>
                <Button
                  type="button"
                  variant={activeTab === "generation" ? "secondary" : "outline"}
                  className="w-full justify-between"
                  onClick={() => setActiveTab("generation")}
                  aria-pressed={activeTab === "generation"}
                >
                  <span className="truncate">{t("scanwordsGeneration")}</span>
                  {generationStepComplete &&
                    (fillStatus === "error" ? (
                      <CircleAlert className="size-4 text-destructive" aria-hidden />
                    ) : (
                      <CircleCheckBig className="size-4 text-emerald-500" aria-hidden />
                    ))}
                </Button>
              </div>
            </div>

            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col gap-4",
                activeTab === "upload" ? "overflow-hidden" : "overflow-y-auto",
              )}
            >
              <div
                className={cn("grid gap-3", activeTab === "dictionary" ? "" : "hidden")}
                aria-hidden={activeTab !== "dictionary"}
              >
                <TemplatePicker
                  templates={templates}
                  selectedId={selectedTemplateId}
                  onSelect={onTemplateSelect}
                  loading={templatesLoading}
                  error={templatesError}
                  showLabel
                  showMeta
                />

                <FilterStatsSummary
                  stats={stats}
                  loading={statsLoading}
                  error={statsError}
                  hint={t("templateStatsSelectHint")}
                />
              </div>

              <div
                className={cn(activeTab === "upload" ? "flex min-h-0 flex-1 flex-col" : "hidden")}
                aria-hidden={activeTab !== "upload"}
              >
                <UploadPanel
                  key={selectedIssueId ?? "issue"}
                  ref={uploadPanelRef}
                  issueId={selectedIssueId}
                  onUploadComplete={handleUploadComplete}
                  onFilesCountChange={setSelectedFilesCount}
                  onFilesMetaChange={setCurrentFiles}
                  onUploadingChange={setUploading}
                  onTotalsChange={setUploadTotals}
                  onParseErrorsChange={setParseErrors}
                  showUploadAction={false}
                  containerClassName="flex min-h-0 flex-1 flex-col"
                  listClassName="flex-1 min-h-0 max-h-none"
                />
              </div>

              <div className={cn(activeTab === "conflicts" ? "" : "hidden")} aria-hidden={activeTab !== "conflicts"}>
                <div className="grid gap-3">
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="default"
                      onClick={handleUploadClick}
                      disabled={uploading || !hasLiveFiles}
                    >
                      {uploading ? t("uploading") : t("uploadAction")}
                    </Button>
                    {uploadClicked &&
                      effectiveUploadCount > 0 &&
                      (uploadHasErrors ? (
                        <CircleAlert className="size-5 text-amber-600" aria-hidden />
                      ) : (
                        <CircleCheckBig className="size-5 text-emerald-500" aria-hidden />
                      ))}
                    {!hasLiveFiles && !uploadClicked && (
                      <span className="text-xs text-muted-foreground">{t("scanwordsConflictsNoFiles")}</span>
                    )}
                  </div>

                  {showParseErrors && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                      <div className="text-xs font-medium text-destructive">
                        {t("scanwordsConflictsParseErrorsTitle")}
                      </div>
                      <ul className="mt-1 grid gap-1 text-xs text-destructive">
                        {visibleParseErrors.map((err) => (
                          <li key={err.key}>
                            {t("scanwordsConflictsParseErrorsItem", { name: err.name, reason: err.reason })}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!selectedTemplateId ? (
                    <p className="text-sm text-muted-foreground">{t("scanwordsConflictsHint")}</p>
                  ) : (
                    <>
                      {statsLoading && <p className="text-xs text-muted-foreground">{t("templateStatsLoading")}</p>}
                      {!statsLoading && statsError && (
                        <p className="text-xs text-destructive">{t("templateStatsError")}</p>
                      )}
                      {!statsLoading && !statsError && (
                        <>
                          {selectedTemplate && (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{t("scanwordsConflictsTemplate")}</span>
                              <Badge variant="outline">{selectedTemplate.name}</Badge>
                            </div>
                          )}
                          {conflictRows.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t("noData")}</p>
                          ) : (
                            <div className="grid gap-2">
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <tbody>
                                    <tr>
                                      <td className="pr-3 whitespace-nowrap font-medium text-muted-foreground">
                                        {t("scanwordsConflictsNeededAll")}
                                      </td>
                                      {conflictRows.map((row) => (
                                        <td
                                          key={`needed-${row.length}`}
                                          className="px-2 whitespace-nowrap tabular-nums"
                                        >
                                          <span className="text-muted-foreground">{row.length}:</span>{" "}
                                          <span>{f.number(row.needed)}</span>
                                        </td>
                                      ))}
                                    </tr>
                                    <tr>
                                      <td className="pr-3 whitespace-nowrap font-medium text-muted-foreground">
                                        {t("scanwordsConflictsDictionaryLine")}
                                      </td>
                                      {conflictRows.map((row) => {
                                        const shortage = row.available < row.needed;
                                        const excess =
                                          row.available > row.needed && (row.available - row.needed) / row.needed < 0.2;
                                        const countClass = shortage
                                          ? "text-destructive"
                                          : excess
                                            ? "text-amber-600"
                                            : "text-muted-foreground";
                                        return (
                                          <td
                                            key={`dict-${row.length}`}
                                            className="px-2 whitespace-nowrap tabular-nums"
                                          >
                                            <span className="text-muted-foreground">{row.length}:</span>{" "}
                                            <span className={countClass}>{f.number(row.available)}</span>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                              {hasShortage && (
                                <p className="text-xs text-destructive">{t("scanwordsConflictsShortage")}</p>
                              )}
                              {hasExcess && <p className="text-xs text-amber-600">{t("scanwordsConflictsExcess")}</p>}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className={cn(activeTab === "generation" ? "" : "hidden")} aria-hidden={activeTab !== "generation"}>
                <div className="grid gap-3">
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">{t("scanwordsFillTitle")}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleSettingsOpen}
                              aria-label={t("scanwordsFillSettings")}
                            >
                              <Settings className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("scanwordsFillSettings")}</TooltipContent>
                        </Tooltip>
                        <Button type="button" variant="default" onClick={handleFillStart} disabled={!fillCanStart}>
                          {fillStarting ? t("scanwordsFillStarting") : t("scanwordsFillStart")}
                        </Button>
                      </div>
                    </div>
                    {!fillReady && <p className="mt-2 text-xs text-muted-foreground">{t("scanwordsFillHint")}</p>}
                    {fillError && <p className="mt-2 text-xs text-destructive">{fillError}</p>}
                    {fillJob && (
                      <div className="mt-3 grid gap-2 text-xs">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>{t("scanwordsFillProgressLabel")}</span>
                          <span>
                            {fillStatusLabel}
                            {fillTotal != null && (
                              <span className="ml-2 tabular-nums">
                                {f.number(fillCompleted ?? 0)}/{f.number(fillTotal)}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-2 rounded-full transition-all",
                              fillStatus === "error" ? "bg-destructive" : "bg-emerald-500",
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, fillProgress))}%` }}
                          />
                        </div>
                        {fillJob.currentTemplate && (
                          <div className="text-muted-foreground">
                            {t("scanwordsFillTemplateLabel", { name: fillJob.currentTemplate })}
                          </div>
                        )}
                        {fillJob.error && <div className="text-destructive">{fillJob.error}</div>}
                        {archiveUrl && (
                          <Button asChild variant="secondary" size="sm">
                            <a href={archiveUrl}>{t("scanwordsFillDownload")}</a>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t("scanwordsFillSettingsTitle")}</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label>{t("scanwordsFillSpeedLabel")}</Label>
                          <RadioGroup
                            value={settingsDraft.speedPreset}
                            onValueChange={(value) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                speedPreset: value as FillSpeedPreset,
                              }))
                            }
                          >
                            {speedOptions.map((option) => (
                              <div
                                key={option.value}
                                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <RadioGroupItem id={`fill-speed-${option.value}`} value={option.value} />
                                  <Label htmlFor={`fill-speed-${option.value}`}>{option.label}</Label>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {t("scanwordsFillMaxNodes", { value: f.number(option.maxNodes) })}
                                </span>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="fill-parallel">{t("scanwordsFillParallelLabel")}</Label>
                          <Input
                            id="fill-parallel"
                            type="number"
                            min={PARALLEL_MIN}
                            max={PARALLEL_MAX}
                            value={settingsDraft.parallel}
                            onChange={(event) => handleParallelChange(event.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t("scanwordsFillParallelHint", {
                              min: f.number(PARALLEL_MIN),
                              max: f.number(PARALLEL_MAX),
                            })}
                          </p>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {t("scanwordsFillSettingsSummary", {
                            maxNodes: f.number(draftOptions.maxNodes),
                            parallel: f.number(draftOptions.parallel),
                            restarts: f.number(draftOptions.restarts),
                          })}
                        </p>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
                          {t("cancel")}
                        </Button>
                        <Button type="button" onClick={handleSettingsSave} disabled={settingsSaving}>
                          {t("save")}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="text-sm font-medium">{t("scanwordsGenerationTemplates")}</div>
                    {templateList.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">{t("scanwordsGenerationEmpty")}</p>
                    ) : (
                      <ul className="mt-2 grid gap-2">
                        {templateList.map((item, idx) => {
                          const statusLabel = templateStatusLabel(item.status);
                          const badgeVariant =
                            item.status === "error"
                              ? "destructive"
                              : item.status === "running"
                                ? "secondary"
                                : "outline";
                          const displayName = item.sourceName ?? item.name;
                          const rowKey = item.key ?? `${item.order ?? idx}-${displayName}`;
                          const errorText = templateErrorText(item.error);
                          return (
                            <li key={rowKey} className="rounded-md border bg-background/80 p-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium">{displayName}</span>
                                <Badge variant={badgeVariant}>{statusLabel}</Badge>
                              </div>
                              {errorText && <div className="mt-1 text-destructive">{errorText}</div>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </TooltipProvider>
  );
}
