"use client";

import { CircleAlert, CircleCheckBig, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getScanwordUploadSnapshotAction, saveScanwordUploadSnapshotAction } from "@/app/actions/scanwords";
import { FilterStatsSummary } from "@/components/dictionary/FilterStatsSummary";
import { TemplatePicker } from "@/components/dictionary/TemplatePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UploadFileInfo, UploadPanelHandle, UploadParseError } from "@/components/upload/UploadPanel";
import { UploadPanel } from "@/components/upload/UploadPanel";
import { cn } from "@/lib/utils";
import type { DictionaryTemplateItem, FilterStats } from "@/types/dictionary-templates";
import type { Edition, Issue } from "./types";

type WorkspaceTab = "dictionary" | "upload" | "conflicts";

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
  const selectedIssueId = selectedIssue?.id ?? null;

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  useEffect(() => {
    if (!selectedIssueId) return;
    setActiveTab("dictionary");
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
  }, [selectedIssueId]);

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

  const dictionaryComplete = selectedTemplateId != null;
  const effectiveUploadCount = hasLiveFiles ? liveFilesCount : lastUploadCount;
  const effectiveErrors = hasLiveFiles ? parseErrors : lastUploadErrors;
  const effectiveTotals = hasLiveFiles ? uploadTotals : lastUploadTotals;
  const uploadHasFiles = effectiveUploadCount > 0;
  const uploadHasErrors = effectiveErrors.length > 0;
  const uploadStepComplete = uploadHasFiles;
  const conflictsStepComplete = uploadClicked;
  const showParseErrors = hasLiveFiles ? parseErrors.length > 0 : lastUploadErrors.length > 0;
  const visibleParseErrors = hasLiveFiles ? parseErrors : lastUploadErrors;
  const completedSteps = (dictionaryComplete ? 1 : 0) + (uploadStepComplete ? 1 : 0) + (conflictsStepComplete ? 1 : 0);
  const totalSteps = 3;
  const progressSteps = [1, 2, 3];

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
    setUploadClicked(true);
    setLastUploadCount(snapshot.count);
    setLastUploadErrors(snapshot.errors);
    setLastUploadFiles(snapshot.files);
    setLastUploadTotals(snapshot.neededStats ?? null);
    void uploadPanelRef.current?.upload();
  }, [currentFiles, liveFilesCount, parseErrors, uploadTotals]);

  const handleUploadComplete = useCallback(async () => {
    if (!selectedIssueId) return;
    const snapshot = lastUploadRef.current;
    setLastUploadCount(snapshot.count);
    setLastUploadErrors(snapshot.errors);
    setLastUploadFiles(snapshot.files);
    setLastUploadTotals(snapshot.neededStats ?? null);
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

  if (!selectedIssue) return null;

  return (
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
                  fillClass = uploadHasErrors ? "bg-amber-500" : "bg-emerald-500";
                }
                return <span key={step} className={cn("h-2 flex-1 rounded-full transition-colors", fillClass)} />;
              })}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
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
                  (uploadHasErrors ? (
                    <CircleAlert className="size-4 text-amber-600" aria-hidden />
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
                                      <td key={`needed-${row.length}`} className="px-2 whitespace-nowrap tabular-nums">
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
                                        <td key={`dict-${row.length}`} className="px-2 whitespace-nowrap tabular-nums">
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
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
