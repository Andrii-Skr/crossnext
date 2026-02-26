"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { FilterStatsSummary } from "@/components/dictionary/FilterStatsSummary";
import { TemplatePicker } from "@/components/dictionary/TemplatePicker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadPanel } from "@/components/upload/UploadPanel";
import { cn } from "@/lib/utils";
import { ArchivesDialog } from "./workspace/ArchivesDialog";
import { ConflictsPanel } from "./workspace/ConflictsPanel";
import { FillReviewDialog } from "./workspace/FillReviewDialog";
import { FillSettingsDialog } from "./workspace/FillSettingsDialog";
import { GenerationPanel } from "./workspace/GenerationPanel";
import { useScanwordFill } from "./workspace/hooks/useScanwordFill";
import { useScanwordUploadFlow } from "./workspace/hooks/useScanwordUploadFlow";
import type { ScanwordsWorkspaceProps, WorkspaceTab } from "./workspace/model";
import { WorkspaceProgressHeader } from "./workspace/WorkspaceProgressHeader";

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
  const crossApiBase = (process.env.NEXT_PUBLIC_CROSS_API_URL || "http://localhost:3001").replace(/\/$/, "");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("dictionary");
  const selectedIssueId = selectedIssue?.id ?? null;
  const tabStorageKey = selectedIssueId ? `scanwords:workspaceTab:${selectedIssueId}` : null;

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const upload = useScanwordUploadFlow({
    selectedIssueId,
    selectedTemplateId,
    selectedTemplateName: selectedTemplate?.name ?? null,
  });

  const fill = useScanwordFill({
    selectedIssueId,
    selectedTemplateId,
    filesSignature: upload.filesSignature,
    crossApiBase,
    t,
  });

  useEffect(() => {
    if (!selectedIssueId) return;
    const saved = typeof window !== "undefined" && tabStorageKey ? window.localStorage.getItem(tabStorageKey) : null;
    const normalized: WorkspaceTab =
      saved === "dictionary" || saved === "upload" || saved === "conflicts" || saved === "generation"
        ? saved
        : "dictionary";
    setActiveTab(normalized);
  }, [selectedIssueId, tabStorageKey]);

  useEffect(() => {
    if (!selectedIssueId || !tabStorageKey) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(tabStorageKey, activeTab);
  }, [activeTab, selectedIssueId, tabStorageKey]);

  const dictionaryComplete = selectedTemplateId != null;
  const conflictsStepComplete = upload.uploadClicked;
  const generationStepComplete = fill.fillStatus === "done" || fill.fillStatus === "error";
  const generationHasTemplateErrors = fill.templateList.some((item) => item.status === "error");

  const neededCounts = useMemo(() => {
    if (!upload.effectiveTotals) return [];
    return Object.entries(upload.effectiveTotals)
      .filter(([key, value]) => key !== "total" && value > 0)
      .map(([key, value]) => ({ length: Number(key), count: value }))
      .filter((row) => Number.isFinite(row.length))
      .sort((a, b) => a.length - b.length);
  }, [upload.effectiveTotals]);

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
  const conflictsHasIssues = upload.uploadHasErrors || hasShortage || hasExcess;

  const fillReady = dictionaryComplete && upload.uploadHasFiles && !upload.uploadHasErrors && upload.uploadClicked;
  const fillCanStart =
    fillReady &&
    !fill.fillStarting &&
    fill.fillStatus !== "running" &&
    fill.fillStatus !== "queued" &&
    fill.fillStatus !== "review";

  const completedSteps =
    (dictionaryComplete ? 1 : 0) +
    (upload.uploadStepComplete ? 1 : 0) +
    (conflictsStepComplete ? 1 : 0) +
    (generationStepComplete ? 1 : 0);
  const totalSteps = 4;

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
            <WorkspaceProgressHeader
              activeTab={activeTab}
              onTabChange={setActiveTab}
              dictionaryComplete={dictionaryComplete}
              uploadStepComplete={upload.uploadStepComplete}
              effectiveUploadCount={upload.effectiveUploadCount}
              uploadHasErrors={upload.uploadHasErrors}
              conflictsStepComplete={conflictsStepComplete}
              conflictsHasIssues={conflictsHasIssues}
              generationStepComplete={generationStepComplete}
              generationHasTemplateErrors={generationHasTemplateErrors}
              fillStatus={fill.fillStatus}
              completedSteps={completedSteps}
              totalSteps={totalSteps}
            />

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
                  ref={upload.uploadPanelRef}
                  issueId={selectedIssueId}
                  onUploadComplete={upload.handleUploadComplete}
                  onFilesCountChange={upload.setSelectedFilesCount}
                  onFilesMetaChange={upload.setCurrentFiles}
                  onUploadingChange={upload.setUploading}
                  onTotalsChange={upload.setUploadTotals}
                  onParseErrorsChange={upload.setParseErrors}
                  showUploadAction={false}
                  containerClassName="flex min-h-0 flex-1 flex-col"
                  listClassName="flex-1 min-h-0 max-h-none"
                />
              </div>

              <ConflictsPanel
                active={activeTab === "conflicts"}
                uploading={upload.uploading}
                hasLiveFiles={upload.hasLiveFiles}
                uploadClicked={upload.uploadClicked}
                effectiveUploadCount={upload.effectiveUploadCount}
                uploadHasErrors={upload.uploadHasErrors}
                showParseErrors={upload.showParseErrors}
                visibleParseErrors={upload.visibleParseErrors}
                selectedTemplateId={selectedTemplateId}
                selectedTemplateName={selectedTemplate?.name ?? null}
                statsLoading={statsLoading}
                statsError={statsError}
                conflictRows={conflictRows}
                hasShortage={hasShortage}
                hasExcess={hasExcess}
                onUploadClick={upload.handleUploadClick}
              />

              <GenerationPanel
                active={activeTab === "generation"}
                fillReady={fillReady}
                fillError={fill.fillError}
                fillJob={fill.fillJob}
                fillStatus={fill.fillStatus}
                hasTemplateErrors={generationHasTemplateErrors}
                fillStatusLabel={fill.fillStatusLabel}
                fillProgress={fill.fillProgress}
                fillCompleted={fill.fillCompleted}
                fillTotal={fill.fillTotal}
                archiveUrl={fill.archiveUrl}
                latestArchiveOnly={fill.latestArchiveOnly}
                fillCanStart={fillCanStart}
                fillStarting={fill.fillStarting}
                reviewAvailable={fill.fillStatus === "review"}
                templateList={fill.templateList}
                templateStatusLabel={fill.templateStatusLabel}
                templateErrorText={fill.templateErrorText}
                onSettingsOpen={fill.handleSettingsOpen}
                onFillStart={fill.handleFillStart}
                onLatestArchiveOnlyChange={fill.handleLatestArchiveOnlyChange}
                onOpenArchivesDialog={() => void fill.openArchivesDialog()}
                onOpenReview={() => fill.setReviewOpen(true)}
              />
            </div>

            <FillSettingsDialog
              open={fill.settingsOpen}
              onOpenChange={fill.setSettingsOpen}
              settingsDraft={fill.settingsDraft}
              settingsSaving={fill.settingsSaving}
              speedOptions={fill.speedOptions}
              draftOptions={fill.draftOptions}
              onSpeedPresetChange={fill.handleSpeedPresetChange}
              onParallelChange={fill.handleParallelChange}
              onUsageStatsChange={fill.handleUsageStatsChange}
              onSave={() => void fill.handleSettingsSave()}
            />

            <ArchivesDialog
              open={fill.archivesDialogOpen}
              onOpenChange={fill.setArchivesDialogOpen}
              selectedEditionName={selectedEdition?.name ?? null}
              selectedIssueLabel={selectedIssue.label}
              archivesLoading={fill.archivesLoading}
              archivesError={fill.archivesError}
              archives={fill.archives}
              crossApiBase={crossApiBase}
              fillStatusLabelByValue={fill.fillStatusLabelByValue}
            />

            <FillReviewDialog
              open={fill.reviewOpen}
              onOpenChange={fill.setReviewOpen}
              reviewJobId={fill.fillJob?.id ?? null}
              reviewData={fill.reviewData}
              loading={fill.reviewLoading}
              finalizing={fill.reviewFinalizing}
              error={fill.reviewError}
              onFinalize={fill.finalizeReview}
              onRequestCandidates={fill.requestWordCandidates}
            />
          </CardContent>
        </Card>
      </section>
    </TooltipProvider>
  );
}
