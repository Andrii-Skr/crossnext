"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, SquarePlus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
}: {
  total: number;
  totalDefs: number;
  sortField?: "word";
  sortDir: SortDir;
  defSortDir: SortDir;
  onToggleWordSort: () => void;
  onToggleDefSort: () => void;
  onOpenNewWord: () => void;
}) {
  const t = useTranslations();
  const f = useFormatter();
  return (
    <TooltipProvider>
      <div className="w-full flex items-center px-1 py-2 text-sm text-muted-foreground border-b">
        <div className="w-2/6 shrink-0 flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
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
          </button>
          <span className="text-muted-foreground">
            {t("countSuffix", { count: f.number(total) })}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                onClick={onOpenNewWord}
                aria-label={t("new")}
              >
                <SquarePlus className="size-4" aria-hidden />
                <span className="sr-only">{t("new")}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("new")}</TooltipContent>
          </Tooltip>
        </div>
        <div className="w-4/5 min-w-0 pl-4 flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
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
          </button>
          <span className="text-muted-foreground">
            {t("countSuffix", { count: f.number(totalDefs) })}
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}

