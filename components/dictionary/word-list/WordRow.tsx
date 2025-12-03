"use client";
import { CirclePlus, Hash, SquarePen, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AddDefinitionModal } from "@/components/dictionary/AddDefinitionModal";
import { DefTagsModal } from "@/components/dictionary/DefTagsModal";
import type { Word } from "@/components/dictionary/WordItem";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useClientTimeZone } from "@/lib/date";
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
}) {
  const t = useTranslations();
  const f = useFormatter();
  const timeZone = useClientTimeZone();
  const hasCollapsedAddDef = useUiStore((s) => !!s.addDefCollapsed);

  return (
    <TooltipProvider>
      <li className="flex flex-col gap-3 py-3 border-b md:flex-row md:items-start">
        {/* Left: word */}
        <div className="w-full px-1 md:w-1/3 md:min-w-[14rem]">
          <div className="group relative font-medium md:pr-16 break-words">
            {word.word_text}
            <div className="mt-2 md:mt-0 md:absolute md:right-0 md:top-0 flex gap-1 controls-hover-visible transition">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
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
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("addDefinition")}</TooltipContent>
              </Tooltip>
              {!word.is_pending_edit && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                      onClick={() => onEditWordStart(word.word_text)}
                      aria-label={t("editWord")}
                    >
                      <SquarePen className="size-4" aria-hidden />
                      <span className="sr-only">{t("editWord")}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t("editWord")}</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                    onClick={onRequestDeleteWord}
                    aria-label={t("delete")}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">{t("delete")}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("delete")}</TooltipContent>
              </Tooltip>
            </div>
            <AddDefinitionModal
              wordId={word.id}
              open={isAddDefinitionOpen}
              onOpenChange={onAddDefinitionOpenChange}
              existing={word.opred_v.map((d) => ({
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
            {word.opred_v.map((d) => (
              <li
                key={d.id}
                className="group flex items-start gap-2 w-full rounded px-2 py-1 transition-colors hover:bg-accent/50 focus-within:bg-accent/50"
              >
                <span className="text-muted-foreground mt-[2px] leading-none">•</span>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                  <span className="min-w-0 text-sm leading-relaxed">
                    {d.text_opr}
                    {d.end_date ? (
                      <Badge variant="secondary" className="ml-2">
                        {t("until", {
                          value: f.dateTime(new Date(d.end_date), {
                            dateStyle: "short",
                            timeZone,
                          }),
                        })}
                      </Badge>
                    ) : null}
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
                        <button
                          type="button"
                          className="p-1 rounded text-muted-foreground controls-hover-visible hover:text-foreground hover:bg-accent transition"
                          onClick={() => onDefTagsOpenChange(d.id, true)}
                          aria-label={t("tags")}
                        >
                          <Hash className="size-4" aria-hidden />
                          <span className="sr-only">{t("manageTags")}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t("manageTags")}</TooltipContent>
                    </Tooltip>
                    {!d.is_pending_edit && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="p-1 rounded text-muted-foreground controls-hover-visible hover:text-foreground hover:bg-accent transition"
                            onClick={() => onEditDefStart(d.id, d.text_opr, d.difficulty, d.end_date ?? null)}
                            aria-label={t("editDefinition")}
                          >
                            <SquarePen className="size-4" aria-hidden />
                            <span className="sr-only">{t("editDefinition")}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t("editDefinition")}</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="p-1 rounded text-muted-foreground controls-hover-visible hover:text-foreground hover:bg-accent transition"
                          onClick={() => onRequestDeleteDef(d.id, d.text_opr)}
                          aria-label={t("delete")}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          <span className="sr-only">{t("delete")}</span>
                        </button>
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
          </ul>
        </div>
      </li>
    </TooltipProvider>
  );
}
