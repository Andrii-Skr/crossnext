"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Rnd } from "react-rnd";
import { toast } from "sonner";
import { z } from "zod";
import {
  AddDefHeader,
  DefinitionSection,
  MetaSection,
  SimilarMatchesList,
  type Tag,
} from "@/components/dictionary/add-definition";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetcher } from "@/lib/fetcher";
import type { ExistingDef } from "@/lib/similarityClient";
import { compareWithPrepared, prepareExisting } from "@/lib/similarityClient";
import { SIMILARITY_CONFIG } from "@/lib/similarityConfig";
import { useDifficulties } from "@/lib/useDifficulties";
import { useGenerateDefinition } from "@/lib/useGenerateDefinition";
import { useDictionaryStore } from "@/store/dictionary";
import { usePendingStore } from "@/store/pending";
import { useUiStore } from "@/store/ui";

export function AddDefinitionModal({
  wordId,
  open,
  onOpenChange,
  existing = [],
  wordText,
}: {
  wordId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Array<Pick<ExistingDef, "id" | "text" | "lang">>;
  wordText?: string;
}) {
  const t = useTranslations();
  const increment = usePendingStore((s) => s.increment);
  const [collapsed, setCollapsed] = useState(false);
  const addDefCollapsed = useUiStore((s) => s.addDefCollapsed);
  const collapseAddDef = useUiStore((s) => s.collapseAddDef);
  const clearAddDef = useUiStore((s) => s.clearAddDef);
  const panelSize = useUiStore((s) => s.panelSize);
  const setPanelSize = useUiStore((s) => s.setPanelSize);
  // floating panel position/size state
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 80 });
  const mountedRef = useRef(false);
  const [difficulty, setDifficulty] = useState<number>(1);
  const [endDate, setEndDate] = useState<Date | null>(null);
  // no-op
  // RHF + Zod for validation
  const DEF_MAX_LENGTH = 255;
  const schema = z.object({
    definition: z
      .string()
      .min(1, t("definitionRequired", { default: "Definition is required" }))
      .max(DEF_MAX_LENGTH, t("definitionMaxError", { max: DEF_MAX_LENGTH })),
    note: z.string().max(512).optional().or(z.literal("")),
  });
  type FormValues = z.input<typeof schema>;
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { definition: "", note: "" },
  });
  const [selectedTags, setSelectedTags] = useState<{ id: number; name: string }[]>([]);
  const submitting = isSubmitting;

  // Live form values used in similarity + cache
  const defValue = watch("definition");
  const langValue = useDictionaryStore((s) => s.dictionaryLang);
  const simLang =
    langValue === "ru" || langValue === "uk" || langValue === "en" ? (langValue as "ru" | "uk" | "en") : undefined;
  const { generate, loading: genLoading } = useGenerateDefinition();

  // Подготовка кэша существующих определений (зависит только от языка и входного массива)
  const preparedExisting = useMemo(() => {
    return prepareExisting(
      existing.map((e) => ({
        id: e.id,
        text: e.text,
        lang: e.lang ?? simLang,
      })),
      {
        /* defaults */
      },
    );
  }, [existing, simLang]);

  const [similarMatches, setSimilarMatches] = useState<
    {
      id: string | number;
      text: string;
      percent: number;
      kind: "duplicate" | "similar";
    }[]
  >([]);

  // tag suggestions handled in TagPicker

  const { data: difficultiesData } = useDifficulties(open);
  const difficulties = difficultiesData ?? [1, 2, 3, 4, 5];

  // Live similarity check for new definition against existing ones (same word)
  useEffect(() => {
    if (!open) return;
    const text = (defValue ?? "").trim();
    if (!text || preparedExisting.length === 0) {
      setSimilarMatches([]);
      return;
    }
    // compute using centralized similarity config
    const res = compareWithPrepared({ text, lang: simLang }, preparedExisting, {
      nearThreshold: SIMILARITY_CONFIG.nearThreshold,
      duplicateThreshold: SIMILARITY_CONFIG.duplicateThreshold,
      topK: SIMILARITY_CONFIG.topK,
    });
    const items = res.top
      .filter((i) => i.percent >= SIMILARITY_CONFIG.nearThreshold)
      .map((i) => ({
        ...i,
        kind: i.percent >= SIMILARITY_CONFIG.duplicateThreshold ? ("duplicate" as const) : ("similar" as const),
      }));
    setSimilarMatches(items);
  }, [open, defValue, simLang, preparedExisting]);

  // tag creation handled in TagPicker

  function addTag(tag: { id: number; name: string }) {
    if (selectedTags.some((t) => t.id === tag.id)) return;
    setSelectedTags((prev) => [...prev, tag]);
  }
  function removeTag(id: number) {
    setSelectedTags((prev) => prev.filter((t) => t.id !== id));
  }

  const onCreate = handleSubmit(async (values) => {
    try {
      // Normalize end date as end-of-day ISO string or null
      const end_date = endDate
        ? new Date(
            Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(), 23, 59, 59, 999),
          ).toISOString()
        : null;
      await fetcher(`/api/pending/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordId,
          definition: values.definition,
          note: (values.note || "").trim() || undefined,
          language: langValue,
          tags: selectedTags.map((t) => t.id),
          difficulty,
          end_date,
        }),
      });
      increment({ words: 1, descriptions: 1 });
      toast.success(t("new"));
      onOpenChange(false);
      reset();
      setSelectedTags([]);
      setDifficulty(1);
      setEndDate(null);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(msg);
    }
  });

  const defId = useId();
  const noteId = useId();
  const endId = useId();
  useEffect(() => {
    if (!open) return;
    setCollapsed(addDefCollapsed?.wordId === wordId);
  }, [open, addDefCollapsed, wordId]);
  // Reset form content and local UI state on open/word change to avoid stale generated values
  useEffect(() => {
    if (!open) return;
    // clear content fields on open
    reset({ definition: "", note: "" });
    setSelectedTags([]);
    setDifficulty(1);
    setEndDate(null);
    // position panel near left edge and vertically centered on open (do not change size)
    if (typeof window !== "undefined") {
      mountedRef.current = true;
      const margin = 16;
      const H = window.innerHeight;
      const x = margin;
      const yCentered = Math.floor((H - panelSize.height) / 2);
      const y = Math.max(margin, Math.min(yCentered, H - panelSize.height - margin));
      setPos({ x, y });
    }
  }, [open, reset, panelSize.height]);
  // Clear global collapsed state on unmount/close if it belongs to this modal
  useEffect(() => {
    if (!open && addDefCollapsed?.wordId === wordId) clearAddDef();
  }, [open, addDefCollapsed, clearAddDef, wordId]);
  // close with Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  // keep panel inside viewport on window resize and preserve left snap (no size changes)
  useEffect(() => {
    if (!open) return;
    function onResize() {
      if (!mountedRef.current) return;
      const margin = 16;
      const W = window.innerWidth;
      const H = window.innerHeight;
      let { x, y } = pos;
      // if near left edge, keep docked; otherwise clamp inside viewport
      if (x <= margin + 4) x = margin;
      else x = Math.min(Math.max(margin, x), W - panelSize.width - margin);
      // vertically center on resize
      const yCentered = Math.floor((H - panelSize.height) / 2);
      y = Math.max(margin, Math.min(yCentered, H - panelSize.height - margin));
      setPos({ x, y });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, pos, panelSize.height, panelSize.width]);

  // Re-clamp position when persisted size changes while open (rehydration or other windows)
  useEffect(() => {
    if (!open) return;
    const margin = 16;
    const W = window.innerWidth;
    const H = window.innerHeight;
    setPos((prev) => {
      let x = prev.x;
      let y = prev.y;
      if (x <= margin + 4) x = margin;
      else x = Math.min(Math.max(margin, x), W - panelSize.width - margin);
      const yCentered = Math.floor((H - panelSize.height) / 2);
      y = Math.max(margin, Math.min(yCentered, H - panelSize.height - margin));
      if (x === prev.x && y === prev.y) return prev;
      return { x, y };
    });
  }, [open, panelSize.height, panelSize.width]);
  if (!open) return null;

  return (
    <TooltipProvider>
      <div className="fixed inset-0 z-50 pointer-events-none">
        {collapsed ? (
          <div className="pointer-events-auto fixed bottom-4 left-4 z-50">
            <div className="rounded-lg border bg-background p-3 shadow-lg flex items-center gap-2">
              <span className="text-sm font-medium">
                {t("addDefinition")}
                {wordText ? `: ${wordText}` : ""}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={t("expand")}
                    onClick={() => {
                      setCollapsed(false);
                      clearAddDef();
                    }}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("expand")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={t("cancel")}
                    onClick={() => {
                      onOpenChange(false);
                      clearAddDef();
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("cancel")}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        ) : (
          <Rnd
            bounds="window"
            size={{ width: panelSize.width, height: panelSize.height }}
            position={{ x: pos.x, y: pos.y }}
            onDragStop={(_e, d) => {
              const margin = 16;
              let x = d.x;
              if (x <= margin + 4) x = margin;
              setPos({ x, y: d.y });
            }}
            onResizeStop={(_e, _dir, ref, _delta, position) => {
              const newWidth = ref.offsetWidth;
              const newHeight = ref.offsetHeight;
              setPanelSize({ width: newWidth, height: newHeight });
              setPos(position);
            }}
            minWidth={360}
            minHeight={320}
            enableResizing={{
              bottom: true,
              right: true,
              bottomRight: true,
              left: true,
            }}
            dragHandleClassName="adddef-drag-handle"
            className="pointer-events-auto"
          >
            <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
              <AddDefHeader
                title={`${t("addDefinition")}${wordText ? `: ${wordText}` : ""}`}
                onCollapse={() => {
                  setCollapsed(true);
                  collapseAddDef({ wordId, wordText });
                }}
                onClose={() => onOpenChange(false)}
              />
              <div className="flex-1 overflow-auto p-4">
                {wordText && (
                  <div className="text-xs text-muted-foreground">
                    {t("word")}: <span className="text-foreground font-medium">{wordText}</span>
                  </div>
                )}
                <DefinitionSection
                  defLabelId={defId}
                  inputProps={register("definition")}
                  disabled={submitting}
                  errorMessage={errors.definition?.message}
                  valueLength={defValue?.length ?? 0}
                  maxLength={DEF_MAX_LENGTH}
                  genLoading={genLoading}
                  aiDisabled={
                    submitting ||
                    genLoading ||
                    !wordText ||
                    !(langValue === "ru" || langValue === "uk" || langValue === "en")
                  }
                  onGenerate={async () => {
                    if (!wordText) return;
                    const text = await generate({
                      word: wordText,
                      language:
                        langValue === "ru" || langValue === "uk" || langValue === "en"
                          ? (langValue as "ru" | "uk" | "en")
                          : "ru",
                      existing: existing.map((e) => e.text),
                      maxLength: DEF_MAX_LENGTH,
                      toastOnSuccess: true,
                    });
                    if (text) {
                      setValue("definition", text, {
                        shouldTouch: true,
                        shouldDirty: true,
                      });
                    }
                  }}
                />
                <SimilarMatchesList items={similarMatches} threshold={SIMILARITY_CONFIG.nearThreshold} />
                <MetaSection
                  noteLabelId={noteId}
                  noteInput={register("note")}
                  submitting={submitting}
                  difficulty={difficulty}
                  difficulties={difficulties}
                  onDifficultyChange={(n) => setDifficulty(n)}
                  endId={endId}
                  endDate={endDate}
                  onEndDateChange={setEndDate}
                  wordId={wordId}
                  selectedTags={selectedTags as Tag[]}
                  onAddTag={(t) => addTag(t)}
                  onRemoveTag={(id) => removeTag(id)}
                />
              </div>
              <div className="border-t px-4 py-2 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                  {t("cancel")}
                </Button>
                <Button onClick={onCreate} disabled={submitting}>
                  {t("create")}
                </Button>
              </div>
            </div>
          </Rnd>
        )}
      </div>
    </TooltipProvider>
  );
}
