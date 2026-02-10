"use client";

import { Settings } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FillJobState, FillJobStatus, FillTemplateStatus } from "./model";

type GenerationPanelProps = {
  active: boolean;
  fillReady: boolean;
  fillError: string | null;
  fillJob: FillJobState | null;
  fillStatus: FillJobStatus | null;
  hasTemplateErrors: boolean;
  fillStatusLabel: string;
  fillProgress: number;
  fillCompleted: number | null;
  fillTotal: number | null;
  archiveUrl: string | null;
  latestArchiveOnly: boolean;
  fillCanStart: boolean;
  fillStarting: boolean;
  reviewAvailable: boolean;
  templateList: FillTemplateStatus[];
  templateStatusLabel: (status: FillTemplateStatus["status"]) => string;
  templateErrorText: (error?: string | null) => string | null;
  onSettingsOpen: () => void;
  onFillStart: () => void;
  onLatestArchiveOnlyChange: (checked: boolean) => void;
  onOpenArchivesDialog: () => void;
  onOpenReview: () => void;
};

export function GenerationPanel({
  active,
  fillReady,
  fillError,
  fillJob,
  fillStatus,
  hasTemplateErrors,
  fillStatusLabel,
  fillProgress,
  fillCompleted,
  fillTotal,
  archiveUrl,
  latestArchiveOnly,
  fillCanStart,
  fillStarting,
  reviewAvailable,
  templateList,
  templateStatusLabel,
  templateErrorText,
  onSettingsOpen,
  onFillStart,
  onLatestArchiveOnlyChange,
  onOpenArchivesDialog,
  onOpenReview,
}: GenerationPanelProps) {
  const t = useTranslations();
  const f = useFormatter();
  const latestArchiveOnlyCheckboxId = "scanwords-fill-latest-archive-only";

  return (
    <div className={cn(active ? "" : "hidden")} aria-hidden={!active}>
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
                    onClick={onSettingsOpen}
                    aria-label={t("scanwordsFillSettings")}
                  >
                    <Settings className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("scanwordsFillSettings")}</TooltipContent>
              </Tooltip>
              <Button type="button" variant="default" onClick={onFillStart} disabled={!fillCanStart}>
                {fillStarting ? t("scanwordsFillStarting") : t("scanwordsFillStart")}
              </Button>
              {reviewAvailable && (
                <Button type="button" variant="outline" onClick={onOpenReview}>
                  {t("scanwordsFillReviewOpen")}
                </Button>
              )}
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
                    hasTemplateErrors
                      ? "bg-amber-500"
                      : fillStatus === "error"
                        ? "bg-destructive"
                        : fillStatus === "review" || fillStatus === "running" || fillStatus === "queued"
                          ? "bg-amber-500"
                          : "bg-emerald-500",
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
                <div className="flex items-center justify-end gap-3">
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      id={latestArchiveOnlyCheckboxId}
                      className="size-4 rounded border border-input bg-background align-middle accent-primary"
                      checked={latestArchiveOnly}
                      aria-label={t("scanwordsFillDownloadLatestOnly")}
                      onChange={(event) => onLatestArchiveOnlyChange(event.currentTarget.checked)}
                    />
                    <label htmlFor={latestArchiveOnlyCheckboxId} className="cursor-pointer">
                      {t("scanwordsFillDownloadLatestOnly")}
                    </label>
                  </div>
                  {latestArchiveOnly ? (
                    <Button asChild variant="outline" className="bg-background">
                      <a href={archiveUrl}>{t("scanwordsFillDownload")}</a>
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="bg-background" onClick={onOpenArchivesDialog}>
                      {t("scanwordsFillDownload")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-sm font-medium">{t("scanwordsGenerationTemplates")}</div>
          {templateList.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("scanwordsGenerationEmpty")}</p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {templateList.map((item, idx) => {
                const statusLabel = templateStatusLabel(item.status);
                const badgeVariant =
                  item.status === "error" ? "destructive" : item.status === "running" ? "secondary" : "outline";
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
  );
}
