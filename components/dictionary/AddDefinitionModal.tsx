"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Rnd } from "react-rnd";
import { toast } from "sonner";
import { z } from "zod";
import { DefinitionCarousel } from "@/components/admin/pending/DefinitionCarousel";
import {
  AddDefHeader,
  DefinitionSection,
  MetaSection,
  SimilarMatchesList,
  type Tag,
} from "@/components/dictionary/add-definition";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toEndOfDayUtcIso } from "@/lib/date";
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
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const addDefCollapsed = useUiStore((s) => s.addDefCollapsed);
  const collapseAddDef = useUiStore((s) => s.collapseAddDef);
  const clearAddDef = useUiStore((s) => s.clearAddDef);
  const panelSize = useUiStore((s) => s.panelSize);
  const setPanelSize = useUiStore((s) => s.setPanelSize);
  const MIN_PANEL_WIDTH = 360;
  const MIN_PANEL_HEIGHT = 600;
  const initialPanelHeightRef = useRef(panelSize.height);
  // floating panel position/size state
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 80 });
  const mountedRef = useRef(false);
  // RHF + Zod for validation
  const DEF_MAX_LENGTH = 255;
  const schema = z.object({
    definitions: z
      .array(
        z.object({
          definition: z
            .string()
            .trim()
            .min(1, t("definitionRequired", { default: "Definition is required" }))
            .max(DEF_MAX_LENGTH, t("definitionMaxError", { max: DEF_MAX_LENGTH })),
          note: z.string().max(512).optional().or(z.literal("")),
          difficulty: z.number().int().min(0).default(1),
          endDate: z.date().nullable().optional(),
          tags: z.array(z.object({ id: z.number(), name: z.string() })).default([]),
        }),
      )
      .min(1),
  });
  type FormValues = z.input<typeof schema>;
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    control,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      definitions: [{ definition: "", note: "", difficulty: 1, endDate: null, tags: [] }],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: "definitions" });
  const definitions = watch("definitions");
  const submitting = isSubmitting;

  // Live form values used in similarity + cache
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

  const similarByDefinition = useMemo(() => {
    if (!open) return [];
    const defs = definitions ?? [];
    return defs.map((d) => {
      const text = (d?.definition ?? "").trim();
      if (!text || preparedExisting.length === 0) return [];
      const res = compareWithPrepared({ text, lang: simLang }, preparedExisting, {
        nearThreshold: SIMILARITY_CONFIG.nearThreshold,
        duplicateThreshold: SIMILARITY_CONFIG.duplicateThreshold,
        topK: SIMILARITY_CONFIG.topK,
      });
      return res.top
        .filter((i) => i.percent >= SIMILARITY_CONFIG.nearThreshold)
        .map((i) => ({
          ...i,
          kind: i.percent >= SIMILARITY_CONFIG.duplicateThreshold ? ("duplicate" as const) : ("similar" as const),
        }));
    });
  }, [definitions, simLang, preparedExisting, open]);

  const { data: difficultiesData } = useDifficulties(open);
  const difficulties = difficultiesData ?? [1, 2, 3, 4, 5];

  const onCreate = handleSubmit(async (values) => {
    const defs = (values.definitions ?? []).map((d: FormValues["definitions"][number]) => ({
      definition: d.definition,
      note: (d.note || "").trim() || undefined,
      tags: (d.tags ?? []).map((tag) => tag.id),
      difficulty: d.difficulty ?? 1,
      end_date: toEndOfDayUtcIso(d.endDate ?? null) ?? undefined,
    }));
    if (!defs.length) {
      toast.error(t("definitionRequired", { default: "Definition is required" }));
      return;
    }
    try {
      await fetcher(`/api/pending/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordId,
          language: langValue,
          definitions: defs,
        }),
      });
      increment({ words: 1, descriptions: defs.length });
      toast.success(t("new"));
      onOpenChange(false);
      reset({
        definitions: [{ definition: "", note: "", difficulty: 1, endDate: null, tags: [] }],
      });
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(msg);
    }
  });

  const listId = useId();
  const resolvedLang: "ru" | "uk" | "en" =
    langValue === "ru" || langValue === "uk" || langValue === "en" ? langValue : "ru";
  const resetForm = useCallback(() => {
    reset({ definitions: [{ definition: "", note: "", difficulty: 1, endDate: null, tags: [] }] });
    replace([{ definition: "", note: "", difficulty: 1, endDate: null, tags: [] }]);
  }, [replace, reset]);

  useEffect(() => {
    // detect mobile viewport
    if (typeof window !== "undefined") {
      const mql = window.matchMedia("(max-width: 767px)");
      const apply = () => setIsMobile(mql.matches);
      apply();
      mql.addEventListener?.("change", apply);
      return () => mql.removeEventListener?.("change", apply);
    }
    return () => {};
  }, []);

  useEffect(() => {
    if (!open) return;
    setCollapsed(addDefCollapsed?.wordId === wordId);
  }, [open, addDefCollapsed, wordId]);
  // Reset form content and local UI state on open/word change to avoid stale generated values
  // biome-ignore lint/correctness/useExhaustiveDependencies: do not re-run on panel size changes to avoid form reset
  useEffect(() => {
    if (!open) return;
    // clear content fields on open
    resetForm();
    // position panel near left edge and vertically centered on open (do not change size)
    if (typeof window !== "undefined") {
      mountedRef.current = true;
      const margin = 16;
      const H = window.innerHeight;
      const x = margin;
      const baseHeight = initialPanelHeightRef.current || panelSize.height;
      const yCentered = Math.floor((H - baseHeight) / 2);
      const y = Math.max(margin, Math.min(yCentered, H - baseHeight - margin));
      setPos({ x, y });
    }
  }, [open, resetForm, wordId]);
  // Clear global collapsed state on unmount/close if it belongs to this modal
  useEffect(() => {
    if (!open && addDefCollapsed?.wordId === wordId) clearAddDef();
  }, [open, addDefCollapsed, clearAddDef, wordId]);
  // Reset when modal fully closes to ensure carousel starts from first slide next open
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);
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

  // Mobile full-screen modal version
  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="p-0 w-full max-w-none h-[100dvh] max-h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 rounded-none sm:rounded-lg overflow-hidden"
          aria-describedby={undefined}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("addDefinition")}</DialogTitle>
          </DialogHeader>
          <div className="flex h-[100dvh] flex-col">
            <div className="border-b px-4 py-3 text-base font-medium">
              {t("addDefinition")} {wordText ? `: ${wordText}` : ""}
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="mb-3 flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    onOpenChange(false);
                  }}
                  disabled={submitting}
                >
                  {t("cancel")}
                </Button>
                <Button size="sm" onClick={onCreate} disabled={submitting}>
                  {t("create")}
                </Button>
              </div>
              {wordText && (
                <div className="text-xs text-muted-foreground mb-2">
                  {t("word")}: <span className="text-foreground font-medium">{wordText}</span>
                </div>
              )}
              <div className="flex flex-col gap-3">
                <div className="order-first flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => append({ definition: "", note: "", difficulty: 1, endDate: null, tags: [] })}
                    disabled={submitting}
                  >
                    {t("addAnotherDefinition", { default: "Add definition" })}
                  </Button>
                </div>
                {fields.length > 0 && (
                  <DefinitionCarousel
                    className="min-w-0"
                    labelKey="definitionIndex"
                    prevKey="prev"
                    nextKey="next"
                    items={fields.map((field, idx) => {
                      const definitionLabelId = `${listId}-def-${field.id}`;
                      const noteLabelId = `${listId}-note-${field.id}`;
                      const endLabelId = `${listId}-end-${field.id}`;
                      const tagInputId = `${listId}-tags-${field.id}`;
                      const current = definitions?.[idx];
                      const currentTags = current?.tags ?? [];
                      const similar = similarByDefinition[idx] ?? [];
                      return {
                        key: field.id,
                        node: (
                          <div className="rounded-md border p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {t("definition")} #{idx + 1}
                              </span>
                              {fields.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => remove(idx)}
                                  disabled={submitting}
                                >
                                  {t("delete")}
                                </Button>
                              )}
                            </div>
                            <DefinitionSection
                              defLabelId={definitionLabelId}
                              inputProps={register(`definitions.${idx}.definition` as const)}
                              disabled={submitting}
                              errorMessage={errors.definitions?.[idx]?.definition?.message}
                              valueLength={current?.definition?.length ?? 0}
                              maxLength={DEF_MAX_LENGTH}
                              genLoading={genLoading}
                              aiDisabled={submitting || genLoading || !wordText}
                              autoComplete="off"
                              onGenerate={async () => {
                                if (!wordText) return;
                                const text = await generate({
                                  word: wordText,
                                  language: resolvedLang,
                                  existing: existing
                                    .map((e) => e.text)
                                    .concat(
                                      (definitions ?? [])
                                        .filter((_, i) => i !== idx)
                                        .map((d) => d?.definition)
                                        .filter((v): v is string => Boolean(v)),
                                    ),
                                  maxLength: DEF_MAX_LENGTH,
                                  toastOnSuccess: true,
                                });
                                if (text) {
                                  setValue(`definitions.${idx}.definition`, text, {
                                    shouldTouch: true,
                                    shouldDirty: true,
                                  });
                                }
                              }}
                            />
                            <SimilarMatchesList items={similar} threshold={SIMILARITY_CONFIG.nearThreshold} />
                            <MetaSection
                              noteLabelId={noteLabelId}
                              noteInput={register(`definitions.${idx}.note` as const)}
                              noteAutoComplete="off"
                              submitting={submitting}
                              difficulty={current?.difficulty ?? 1}
                              difficulties={difficulties}
                              onDifficultyChange={(n) =>
                                setValue(`definitions.${idx}.difficulty`, n, { shouldDirty: true })
                              }
                              endId={endLabelId}
                              endDate={current?.endDate ?? null}
                              onEndDateChange={(d) =>
                                setValue(`definitions.${idx}.endDate`, d ?? null, { shouldDirty: true })
                              }
                              wordId={tagInputId}
                              selectedTags={currentTags as Tag[]}
                              onAddTag={(t) => {
                                if (currentTags.some((tag) => tag.id === t.id)) return;
                                setValue(`definitions.${idx}.tags`, [...currentTags, t], { shouldDirty: true });
                              }}
                              onRemoveTag={(id) =>
                                setValue(
                                  `definitions.${idx}.tags`,
                                  currentTags.filter((t) => t.id !== id),
                                  { shouldDirty: true },
                                )
                              }
                            />
                          </div>
                        ),
                      };
                    })}
                  />
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
                      resetForm();
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
            minWidth={MIN_PANEL_WIDTH}
            minHeight={MIN_PANEL_HEIGHT}
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
                onClose={() => {
                  resetForm();
                  onOpenChange(false);
                }}
              />
              <div className="flex-1 overflow-auto p-4">
                {wordText && (
                  <div className="text-xs text-muted-foreground">
                    {t("word")}: <span className="text-foreground font-medium">{wordText}</span>
                  </div>
                )}
                <div className="mt-3 mb-1 flex justify-center gap-2 sm:hidden">
                  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
                    {t("cancel")}
                  </Button>
                  <Button size="sm" onClick={onCreate} disabled={submitting}>
                    {t("create")}
                  </Button>
                </div>
                <div className="mt-3 flex flex-col gap-3">
                  {fields.length > 0 && (
                    <DefinitionCarousel
                      className="min-w-0"
                      labelKey="definitionIndex"
                      prevKey="prev"
                      nextKey="next"
                      items={fields.map((field, idx) => {
                        const definitionLabelId = `${listId}-def-${field.id}`;
                        const noteLabelId = `${listId}-note-${field.id}`;
                        const endLabelId = `${listId}-end-${field.id}`;
                        const tagInputId = `${listId}-tags-${field.id}`;
                        const current = definitions?.[idx];
                        const currentTags = current?.tags ?? [];
                        const similar = similarByDefinition[idx] ?? [];
                        return {
                          key: field.id,
                          node: (
                            <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">
                                  {t("definition")} #{idx + 1}
                                </span>
                                {fields.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => remove(idx)}
                                    disabled={submitting}
                                  >
                                    {t("delete")}
                                  </Button>
                                )}
                              </div>
                              <DefinitionSection
                                defLabelId={definitionLabelId}
                                inputProps={register(`definitions.${idx}.definition` as const)}
                                disabled={submitting}
                                errorMessage={errors.definitions?.[idx]?.definition?.message}
                                valueLength={current?.definition?.length ?? 0}
                                maxLength={DEF_MAX_LENGTH}
                                genLoading={genLoading}
                                aiDisabled={submitting || genLoading || !wordText}
                                autoComplete="off"
                                onGenerate={async () => {
                                  if (!wordText) return;
                                  const text = await generate({
                                    word: wordText,
                                    language: resolvedLang,
                                    existing: existing
                                      .map((e) => e.text)
                                      .concat(
                                        (definitions ?? [])
                                          .filter((_, i) => i !== idx)
                                          .map((d) => d?.definition)
                                          .filter((v): v is string => Boolean(v)),
                                      ),
                                    maxLength: DEF_MAX_LENGTH,
                                    toastOnSuccess: true,
                                  });
                                  if (text) {
                                    setValue(`definitions.${idx}.definition`, text, {
                                      shouldTouch: true,
                                      shouldDirty: true,
                                    });
                                  }
                                }}
                              />
                              <SimilarMatchesList items={similar} threshold={SIMILARITY_CONFIG.nearThreshold} />
                              <MetaSection
                                noteLabelId={noteLabelId}
                                noteInput={register(`definitions.${idx}.note` as const)}
                                noteAutoComplete="off"
                                submitting={submitting}
                                difficulty={current?.difficulty ?? 1}
                                difficulties={difficulties}
                                onDifficultyChange={(n) =>
                                  setValue(`definitions.${idx}.difficulty`, n, { shouldDirty: true })
                                }
                                endId={endLabelId}
                                endDate={current?.endDate ?? null}
                                onEndDateChange={(d) =>
                                  setValue(`definitions.${idx}.endDate`, d ?? null, { shouldDirty: true })
                                }
                                wordId={tagInputId}
                                selectedTags={currentTags as Tag[]}
                                onAddTag={(t) => {
                                  if (currentTags.some((tag) => tag.id === t.id)) return;
                                  setValue(`definitions.${idx}.tags`, [...currentTags, t], { shouldDirty: true });
                                }}
                                onRemoveTag={(id) =>
                                  setValue(
                                    `definitions.${idx}.tags`,
                                    currentTags.filter((t) => t.id !== id),
                                    { shouldDirty: true },
                                  )
                                }
                              />
                            </div>
                          ),
                        };
                      })}
                    />
                  )}
                  <div className="order-first flex justify-center sm:order-last sm:justify-start">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => append({ definition: "", note: "", difficulty: 1, endDate: null, tags: [] })}
                      disabled={submitting}
                    >
                      {t("addAnotherDefinition", { default: "Add definition" })}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="border-t px-4 py-2 hidden justify-end gap-2 sm:flex">
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
