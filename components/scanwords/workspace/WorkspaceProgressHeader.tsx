"use client";

import { CircleAlert, CircleCheckBig } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FillJobStatus, WorkspaceTab } from "./model";

type WorkspaceProgressHeaderProps = {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  dictionaryComplete: boolean;
  uploadStepComplete: boolean;
  effectiveUploadCount: number;
  uploadHasErrors: boolean;
  conflictsStepComplete: boolean;
  conflictsHasIssues: boolean;
  generationStepComplete: boolean;
  generationHasTemplateErrors: boolean;
  fillStatus: FillJobStatus | null;
  completedSteps: number;
  totalSteps: number;
};

export function WorkspaceProgressHeader({
  activeTab,
  onTabChange,
  dictionaryComplete,
  uploadStepComplete,
  effectiveUploadCount,
  uploadHasErrors,
  conflictsStepComplete,
  conflictsHasIssues,
  generationStepComplete,
  generationHasTemplateErrors,
  fillStatus,
  completedSteps,
  totalSteps,
}: WorkspaceProgressHeaderProps) {
  const t = useTranslations();
  const f = useFormatter();
  const progressSteps = [1, 2, 3, 4];

  return (
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
            if (generationHasTemplateErrors) fillClass = "bg-amber-500";
            else if (fillStatus === "done") fillClass = "bg-emerald-500";
            else if (fillStatus === "error") fillClass = "bg-destructive";
            else if (fillStatus === "running" || fillStatus === "queued" || fillStatus === "review") {
              fillClass = "bg-amber-500";
            }
          }
          return <span key={step} className={cn("h-2 flex-1 rounded-full transition-colors", fillClass)} />;
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Button
          type="button"
          variant={activeTab === "dictionary" ? "secondary" : "outline"}
          className="w-full justify-between"
          onClick={() => onTabChange("dictionary")}
          aria-pressed={activeTab === "dictionary"}
        >
          <span className="truncate">{t("dictionary")}</span>
          {dictionaryComplete && <CircleCheckBig className="size-4 text-emerald-500" aria-hidden />}
        </Button>
        <Button
          type="button"
          variant={activeTab === "upload" ? "secondary" : "outline"}
          className="w-full justify-between"
          onClick={() => onTabChange("upload")}
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
          onClick={() => onTabChange("conflicts")}
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
          onClick={() => onTabChange("generation")}
          aria-pressed={activeTab === "generation"}
        >
          <span className="truncate">{t("scanwordsGeneration")}</span>
          {generationStepComplete &&
            (fillStatus === "error" ? (
              <CircleAlert className="size-4 text-destructive" aria-hidden />
            ) : generationHasTemplateErrors ? (
              <CircleAlert className="size-4 text-amber-600" aria-hidden />
            ) : (
              <CircleCheckBig className="size-4 text-emerald-500" aria-hidden />
            ))}
        </Button>
      </div>
    </div>
  );
}
