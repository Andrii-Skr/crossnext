"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, SquarePlus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type SortDir = "asc" | "desc" | undefined;

export function WordListHeader({
  total,
  totalDefs,
  sortField,
  sortDir,
  defSortDir,
  onToggleWordSort,
  onToggleDefSort,
  onOpenNewWord,
  bulkMode = false,
  allSelected = false,
  someSelected = false,
  onToggleSelectAll,
}: {
  total: number;
  totalDefs: number;
  sortField?: "word";
  sortDir: SortDir;
  defSortDir: SortDir;
  onToggleWordSort: () => void;
  onToggleDefSort: () => void;
  onOpenNewWord: () => void;
  bulkMode?: boolean;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleSelectAll?: () => void;
}) {
  const t = useTranslations();
  const f = useFormatter();
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  return (
    <TooltipProvider>
      <div className="w-full flex flex-col gap-2 px-1 py-2 text-sm text-muted-foreground border-b md:flex-row md:items-center md:gap-4">
        <div className="flex items-center gap-2 w-full md:w-1/3 md:min-w-[14rem]">
          <Button
            type="button"
            variant="ghost"
            className="h-auto gap-1 p-0 hover:bg-transparent hover:text-foreground"
            onClick={onToggleWordSort}
          >
            <span className="font-medium">{t("word")}</span>
            {sortField === "word" ? (
              sortDir === "asc" ? (
                <ArrowUp className="size-3" aria-hidden />
              ) : (
                <ArrowDown className="size-3" aria-hidden />
              )
            ) : (
              <ArrowUpDown className="size-3 opacity-60" aria-hidden />
            )}
            <span className="sr-only">{t("word")}</span>
          </Button>
          <span className="text-muted-foreground">{t("countSuffix", { count: f.number(total) })}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={onOpenNewWord}
                aria-label={t("new")}
              >
                <SquarePlus className="size-4" aria-hidden />
                <span className="sr-only">{t("new")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("new")}</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2 w-full md:flex-1 md:min-w-0 md:pl-4">
          {bulkMode && (
            <Checkbox
              ref={selectAllRef}
              className="size-4"
              checked={allSelected}
              onChange={() => onToggleSelectAll?.()}
              aria-label={t("selectAll")}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-auto gap-1 p-0 hover:bg-transparent hover:text-foreground"
            onClick={onToggleDefSort}
          >
            <span className="font-medium">{t("definitions")}</span>
            {defSortDir ? (
              defSortDir === "asc" ? (
                <ArrowUp className="size-3" aria-hidden />
              ) : (
                <ArrowDown className="size-3" aria-hidden />
              )
            ) : (
              <ArrowUpDown className="size-3 opacity-60" aria-hidden />
            )}
            <span className="sr-only">{t("definitions")}</span>
          </Button>
          <span className="text-muted-foreground">{t("countSuffix", { count: f.number(totalDefs) })}</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
