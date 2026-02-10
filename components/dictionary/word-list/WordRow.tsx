"use client";
import { CirclePlus, Hash, Loader2, SquarePen, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AddDefinitionModal } from "@/components/dictionary/AddDefinitionModal";
import { DefTagsModal } from "@/components/dictionary/DefTagsModal";
import type { Word } from "@/components/dictionary/WordItem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetcher } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
// Inline editing removed in favor of modal dialogs

export function WordRow({
  word,
  onEditWordStart,
  onEditDefStart,
  onRequestDeleteWord,
  onRequestDeleteDef,
  isAddDefinitionOpen,
  onAddDefinitionOpenChange,
  openTagsForDefId,
  onDefTagsOpenChange,
  onDefTagsSaved,
  bulkMode = false,
  defSortDir,
  lenDir,
  lenField,
  isRowChecked,
  onToggleSelectDef,
}: {
  word: Word;
  onEditWordStart: (currentText: string) => void;
  onEditDefStart: (defId: string, currentText: string, difficulty?: number | null, endDate?: string | null) => void;
  onRequestDeleteWord: () => void;
  onRequestDeleteDef: (defId: string, text: string) => void;
  isAddDefinitionOpen: boolean;
  onAddDefinitionOpenChange: (v: boolean) => void;
  openTagsForDefId: string | null;
  onDefTagsOpenChange: (defId: string, open: boolean) => void;
  onDefTagsSaved: () => void;
  bulkMode?: boolean;
  defSortDir?: "asc" | "desc";
  lenDir?: "asc" | "desc";
  lenField?: "word" | "def";
  isRowChecked?: (id: string) => boolean;
  onToggleSelectDef?: (defId: string, next: boolean) => void;
}) {
  const t = useTranslations();
  const hasCollapsedAddDef = useUiStore((s) => !!s.addDefCollapsed);
  const [expandedDefs, setExpandedDefs] = useState<Word["opred_v"] | null>(null);
  const [loadingDefs, setLoadingDefs] = useState(false);
  const defsKey = useMemo(() => `${word.id}:${word.opred_v.map((d) => d.id).join(",")}`, [word.id, word.opred_v]);
  const defs = expandedDefs ?? word.opred_v;
  const defsTotal = word.defs_total ?? defs.length;
  const isExpanded = !!expandedDefs;
  const hiddenCount = isExpanded ? 0 : Math.max(defsTotal - defs.length, 0);
  const canShowAll = !bulkMode && !isExpanded && hiddenCount > 0;
  const canCollapse = !bulkMode && isExpanded;
  const showToggle = canShowAll || canCollapse;

  useEffect(() => {
    if (!defsKey) return;
    setExpandedDefs(null);
    setLoadingDefs(false);
  }, [defsKey]);

  async function loadAllDefinitions() {
    if (loadingDefs) return;
    try {
      setLoadingDefs(true);
      const params = new URLSearchParams();
      if (defSortDir) params.set("defSortDir", defSortDir);
      if (lenDir) params.set("lenDir", lenDir);
      if (lenField) params.set("lenField", lenField);
      const query = params.toString();
      const res = await fetcher<{ opred_v: Word["opred_v"] }>(
        `/api/dictionary/word/${word.id}${query ? `?${query}` : ""}`,
      );
      setExpandedDefs(res?.opred_v ?? []);
    } catch {
      toast.error(t("saveError"));
    } finally {
      setLoadingDefs(false);
    }
  }

  return (
    <TooltipProvider>
      <li className="flex flex-col gap-3 py-3 border-b md:flex-row md:items-start">
        {/* Left: word */}
        <div className="w-full px-1 md:w-1/3 md:min-w-56">
          <div className="group relative font-medium md:pr-16 wrap-break-word">
            {word.word_text}
            <div className="mt-2 md:mt-0 md:absolute md:right-0 md:top-0 flex gap-1 controls-hover-visible transition">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      if (hasCollapsedAddDef) {
                        toast.warning(t("minimizedAddDefinitionExists"));
                        return;
                      }
                      onAddDefinitionOpenChange(true);
                    }}
                    aria-label={t("addDefinition")}
                  >
                    <CirclePlus className="size-4" aria-hidden />
                    <span className="sr-only">{t("addDefinition")}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("addDefinition")}</TooltipContent>
              </Tooltip>
              {!word.is_pending_edit && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      onClick={() => onEditWordStart(word.word_text)}
                      aria-label={t("editWord")}
                    >
                      <SquarePen className="size-4" aria-hidden />
                      <span className="sr-only">{t("editWord")}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("editWord")}</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={onRequestDeleteWord}
                    aria-label={t("delete")}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">{t("delete")}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("delete")}</TooltipContent>
              </Tooltip>
            </div>
            <AddDefinitionModal
              wordId={word.id}
              open={isAddDefinitionOpen}
              onOpenChange={onAddDefinitionOpenChange}
              existing={defs.map((d) => ({
                id: d.id,
                text: d.text_opr,
              }))}
              wordText={word.word_text}
            />
          </div>
        </div>

        {/* Right: definitions */}
        <div className="w-full min-w-0 md:flex-1 md:pl-4">
          <ul className="grid gap-1">
            {defs.map((d) => (
              <li
                key={d.id}
                className={cn(
                  "group flex items-start gap-2 w-full rounded px-2 py-1 transition-colors hover:bg-accent/50 focus-within:bg-accent/50",
                  isExpanded ? "animate-in fade-in-0 slide-in-from-top-1 duration-200" : "",
                )}
              >
                {bulkMode ? (
                  <Checkbox
                    className="mt-1 size-4"
                    checked={isRowChecked?.(d.id) ?? false}
                    onChange={(e) => onToggleSelectDef?.(d.id, e.currentTarget.checked)}
                    aria-label={t("select")}
                  />
                ) : (
                  <span className="text-muted-foreground mt-0.5 leading-none sm:hidden">•</span>
                )}
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                  <span className="min-w-0 text-sm leading-relaxed">
                    {d.text_opr}
                    {d.tags.length > 0 && (
                      <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                        {d.tags.map((t) => (
                          <Badge key={t.tag.id} variant="outline">
                            <span className="mb-1 h-3">{t.tag.name}</span>
                          </Badge>
                        ))}
                      </span>
                    )}
                  </span>
                  <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap sm:ml-auto sm:self-start">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground controls-hover-visible hover:text-foreground transition"
                          onClick={() => onDefTagsOpenChange(d.id, true)}
                          aria-label={t("tags")}
                        >
                          <Hash className="size-4" aria-hidden />
                          <span className="sr-only">{t("manageTags")}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("manageTags")}</TooltipContent>
                    </Tooltip>
                    {!d.is_pending_edit && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground controls-hover-visible hover:text-foreground transition"
                            onClick={() => onEditDefStart(d.id, d.text_opr, d.difficulty, d.end_date ?? null)}
                            aria-label={t("editDefinition")}
                          >
                            <SquarePen className="size-4" aria-hidden />
                            <span className="sr-only">{t("editDefinition")}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("editDefinition")}</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground controls-hover-visible hover:text-foreground transition"
                          onClick={() => onRequestDeleteDef(d.id, d.text_opr)}
                          aria-label={t("delete")}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          <span className="sr-only">{t("delete")}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("delete")}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <DefTagsModal
                  defId={d.id}
                  open={openTagsForDefId === d.id}
                  onOpenChange={(v) => onDefTagsOpenChange(d.id, v)}
                  onSaved={onDefTagsSaved}
                />
              </li>
            ))}
            {showToggle && (
              <li className="flex items-center px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto p-0 text-xs font-normal text-muted-foreground transition hover:bg-transparent hover:text-foreground disabled:opacity-60"
                  onClick={canCollapse ? () => setExpandedDefs(null) : loadAllDefinitions}
                  disabled={loadingDefs}
                  aria-label={canCollapse ? t("collapse") : t("moreCount", { count: hiddenCount })}
                >
                  {loadingDefs ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                      <span>{t("loading")}</span>
                    </span>
                  ) : canCollapse ? (
                    t("collapse")
                  ) : (
                    t("moreCount", { count: hiddenCount })
                  )}
                </Button>
              </li>
            )}
          </ul>
        </div>
      </li>
    </TooltipProvider>
  );
}
