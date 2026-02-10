"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FillArchiveItem, FillJobStatus } from "./model";

type ArchivesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEditionName: string | null;
  selectedIssueLabel: string;
  archivesLoading: boolean;
  archivesError: string | null;
  archives: FillArchiveItem[];
  crossApiBase: string;
  fillStatusLabelByValue: (status: FillJobStatus | null | undefined) => string;
};

export function ArchivesDialog({
  open,
  onOpenChange,
  selectedEditionName,
  selectedIssueLabel,
  archivesLoading,
  archivesError,
  archives,
  crossApiBase,
  fillStatusLabelByValue,
}: ArchivesDialogProps) {
  const t = useTranslations();
  const f = useFormatter();

  const formatArchiveDate = (value: string | null) => {
    if (!value) return t("scanwordsFillArchiveDateUnknown");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("scanwordsFillArchiveDateUnknown");
    return f.dateTime(date, { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("scanwordsFillArchiveHistoryTitle")}</DialogTitle>
          <DialogDescription>
            {t("scanwordsFillArchiveHistoryDescription", {
              edition: selectedEditionName ?? t("scanwordsFillArchiveUnknownEdition"),
              issue: selectedIssueLabel,
            })}
          </DialogDescription>
        </DialogHeader>

        {archivesLoading ? (
          <p className="text-sm text-muted-foreground">{t("scanwordsFillArchiveHistoryLoading")}</p>
        ) : archivesError ? (
          <p className="text-sm text-destructive">{archivesError}</p>
        ) : archives.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("scanwordsFillArchiveHistoryEmpty")}</p>
        ) : (
          <ul className="grid max-h-[55vh] gap-2 overflow-y-auto">
            {archives.map((item) => {
              const badgeVariant =
                item.status === "error"
                  ? "destructive"
                  : item.status === "running" || item.status === "queued"
                    ? "secondary"
                    : "outline";
              return (
                <li key={item.id} className="rounded-md border bg-muted/20 p-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid gap-1 text-xs">
                      <div className="font-medium">{t("scanwordsFillArchiveItemTitle", { id: item.id })}</div>
                      <div className="text-muted-foreground">
                        {t("scanwordsFillArchiveItemUpdatedAt", {
                          date: formatArchiveDate(item.updatedAt ?? item.createdAt),
                        })}
                      </div>
                      <div className="text-muted-foreground">
                        {item.completedTemplates != null && item.totalTemplates != null
                          ? t("scanwordsFillArchiveItemProgress", {
                              completed: f.number(item.completedTemplates),
                              total: f.number(item.totalTemplates),
                            })
                          : t("scanwordsFillArchiveItemProgressUnknown")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={badgeVariant}>{fillStatusLabelByValue(item.status)}</Badge>
                      <Button asChild variant="outline" size="sm">
                        <a href={`${crossApiBase}/api/fill/${item.id}/archive`}>{t("scanwordsFillDownload")}</a>
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
