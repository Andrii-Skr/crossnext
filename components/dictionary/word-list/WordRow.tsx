"use client";
import { CirclePlus, Hash, SquarePen, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AddDefinitionModal } from "@/components/dictionary/AddDefinitionModal";
import { DefTagsModal } from "@/components/dictionary/DefTagsModal";
import type { Word } from "@/components/dictionary/WordItem";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui";
import { InlineEditor } from "./InlineEditor";

export type EditingState = { type: "word"; id: string } | { type: "def"; id: string } | null;

export function WordRow({
  word,
  editing,
  editValue,
  saving,
  onEditWordStart,
  onEditDefStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onRequestDeleteWord,
  onRequestDeleteDef,
  isAddDefinitionOpen,
  onAddDefinitionOpenChange,
  openTagsForDefId,
  onDefTagsOpenChange,
  onDefTagsSaved,
}: {
  word: Word;
  editing: EditingState;
  editValue: string;
  saving: boolean;
  onEditWordStart: (currentText: string) => void;
  onEditDefStart: (defId: string, currentText: string) => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
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
  const hasCollapsedAddDef = useUiStore((s) => !!s.addDefCollapsed);

  return (
    <TooltipProvider>
      <li className="flex items-start py-3 border-b">
        {/* Left: word */}
        <div className="w-2/6 shrink-0 px-1">
          {editing?.type === "word" && editing.id === word.id ? (
            <InlineEditor
              value={editValue}
              onChange={onEditChange}
              onSave={onEditSave}
              onCancel={onEditCancel}
              saving={saving}
              autoFocus
            />
          ) : (
            <div className="group relative font-medium break-words pr-16">
              {word.word_text}
              <div className="absolute right-0 top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition">
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
          )}
        </div>

        {/* Right: definitions */}
        <div className="w-4/5 min-w-0 pl-4">
          <ul className="grid gap-1">
            {word.opred_v.map((d) => (
              <li key={d.id} className="group flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                {editing?.type === "def" && editing.id === d.id ? (
                  <InlineEditor
                    value={editValue}
                    onChange={onEditChange}
                    onSave={onEditSave}
                    onCancel={onEditCancel}
                    saving={saving}
                    autoFocus
                  />
                ) : (
                  <div className="flex w-full items-start gap-2">
                    <span className="min-w-0">
                      {d.text_opr}
                      {d.end_date ? (
                        <Badge variant="secondary" className="ml-2">
                          {t("until", {
                            value: f.dateTime(new Date(d.end_date), {
                              dateStyle: "short",
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="ml-auto p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition"
                          onClick={() => onDefTagsOpenChange(d.id, true)}
                          aria-label={t("tags")}
                        >
                          <Hash className="size-4" aria-hidden />
                          <span className="sr-only">{t("manageTags")}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t("manageTags")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition"
                          onClick={() => onEditDefStart(d.id, d.text_opr)}
                          aria-label={t("editDefinition")}
                        >
                          <SquarePen className="size-4" aria-hidden />
                          <span className="sr-only">{t("editDefinition")}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t("editDefinition")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition"
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
                )}
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
