"use client";

import { CircleAlert, CircleCheckBig } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UploadParseError } from "@/components/upload/UploadPanel";
import { cn } from "@/lib/utils";
import type { ConflictRow } from "./model";

type ConflictsPanelProps = {
  active: boolean;
  uploading: boolean;
  hasLiveFiles: boolean;
  uploadClicked: boolean;
  effectiveUploadCount: number;
  uploadHasErrors: boolean;
  showParseErrors: boolean;
  visibleParseErrors: UploadParseError[];
  selectedTemplateId: number | null;
  selectedTemplateName: string | null;
  statsLoading: boolean;
  statsError: boolean;
  conflictRows: ConflictRow[];
  hasShortage: boolean;
  hasExcess: boolean;
  onUploadClick: () => void;
};

export function ConflictsPanel({
  active,
  uploading,
  hasLiveFiles,
  uploadClicked,
  effectiveUploadCount,
  uploadHasErrors,
  showParseErrors,
  visibleParseErrors,
  selectedTemplateId,
  selectedTemplateName,
  statsLoading,
  statsError,
  conflictRows,
  hasShortage,
  hasExcess,
  onUploadClick,
}: ConflictsPanelProps) {
  const t = useTranslations();
  const f = useFormatter();
  const totalNeededCount = conflictRows.reduce((sum, row) => sum + row.needed, 0);

  return (
    <div className={cn(active ? "" : "hidden")} aria-hidden={!active}>
      <div className="grid gap-3">
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="default" onClick={onUploadClick} disabled={uploading || !hasLiveFiles}>
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
            <div className="text-xs font-medium text-destructive">{t("scanwordsConflictsParseErrorsTitle")}</div>
            <ul className="mt-1 grid gap-1 text-xs text-destructive">
              {visibleParseErrors.map((err) => (
                <li key={err.key}>{t("scanwordsConflictsParseErrorsItem", { name: err.name, reason: err.reason })}</li>
              ))}
            </ul>
          </div>
        )}

        {!selectedTemplateId ? (
          <p className="text-sm text-muted-foreground">{t("scanwordsConflictsHint")}</p>
        ) : (
          <>
            {statsLoading && <p className="text-xs text-muted-foreground">{t("templateStatsLoading")}</p>}
            {!statsLoading && statsError && <p className="text-xs text-destructive">{t("templateStatsError")}</p>}
            {!statsLoading && !statsError && (
              <>
                {selectedTemplateName && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{t("scanwordsConflictsTemplate")}</span>
                    <Badge variant="outline">{selectedTemplateName}</Badge>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {t("scanwordsConflictsNeededTotal", { count: f.number(totalNeededCount) })}
                </div>
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
                    {hasShortage && <p className="text-xs text-destructive">{t("scanwordsConflictsShortage")}</p>}
                    {hasExcess && <p className="text-xs text-amber-600">{t("scanwordsConflictsExcess")}</p>}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
