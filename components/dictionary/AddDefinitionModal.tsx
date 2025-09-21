"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetcher } from "@/lib/fetcher";
import type { ExistingDef } from "@/lib/similarityClient";
import { compareWithPrepared, prepareExisting } from "@/lib/similarityClient";
import { SIMILARITY_CONFIG } from "@/lib/similarityConfig";
import { useDifficulties } from "@/lib/useDifficulties";
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
  const [difficulty, setDifficulty] = useState<number>(1);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const f = useFormatter();
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
  const [tagQuery, setTagQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { id: number; name: string }[]
  >([]);
  const [selectedTags, setSelectedTags] = useState<
    { id: number; name: string }[]
  >([]);
  const submitting = isSubmitting;

  // Live form values used in similarity + cache
  const defValue = watch("definition");
  const langValue = useDictionaryStore((s) => s.dictionaryLang);
  const simLang =
    langValue === "ru" || langValue === "uk" || langValue === "en"
      ? (langValue as "ru" | "uk" | "en")
      : undefined;
  const [genLoading, setGenLoading] = useState(false);

  // Подготовка кэша существующих определений (зависит только от языка и входного массива)
  const preparedExisting = useMemo(() => {
    return prepareExisting(
      existing.map((e) => ({
        id: e.id,
        text: e.text,
        lang: simLang,
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

  useEffect(() => {
    let cancelled = false;
    if (!tagQuery) {
      setSuggestions([]);
      return;
    }
    fetcher<{ items: { id: number; name: string }[] }>(
      `/api/tags?q=${encodeURIComponent(tagQuery)}`,
    )
      .then((d) => !cancelled && setSuggestions(d.items))
      .catch(() => !cancelled && setSuggestions([]));
    return () => {
      cancelled = true;
    };
  }, [tagQuery]);

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
        kind:
          i.percent >= SIMILARITY_CONFIG.duplicateThreshold
            ? ("duplicate" as const)
            : ("similar" as const),
      }));
    setSimilarMatches(items);
  }, [open, defValue, simLang, preparedExisting]);

  const canCreateTag = useMemo(() => {
    const q = tagQuery.trim();
    if (!q) return false;
    const existsInSuggestions = suggestions.some(
      (s) => s.name.toLowerCase() === q.toLowerCase(),
    );
    const existsInSelected = selectedTags.some(
      (s) => s.name.toLowerCase() === q.toLowerCase(),
    );
    return !existsInSuggestions && !existsInSelected;
  }, [tagQuery, suggestions, selectedTags]);

  async function createTagByName(name: string) {
    const q = name.trim();
    if (!q) return;
    try {
      const created = await fetcher<{ id: number; name: string }>("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: q }),
      });
      addTag(created);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(msg);
    }
  }

  function addTag(tag: { id: number; name: string }) {
    if (selectedTags.some((t) => t.id === tag.id)) return;
    setSelectedTags((prev) => [...prev, tag]);
    setTagQuery("");
  }
  function removeTag(id: number) {
    setSelectedTags((prev) => prev.filter((t) => t.id !== id));
  }

  const onCreate = handleSubmit(async (values) => {
    try {
      // Normalize end date as end-of-day ISO string or null
      const end_date = endDate
        ? new Date(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate(),
            23,
            59,
            59,
            999,
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
      setSuggestions([]);
      setTagQuery("");
      setDifficulty(1);
      setEndDate(null);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(msg);
    }
  });

  const defId = useId();
  const noteId = useId();
  const tagInputId = useId();
  const endId = useId();
  useEffect(() => {
    if (open) setCollapsed(false);
  }, [open]);
  // Reset form content and local UI state on open/word change to avoid stale generated values
  useEffect(() => {
    if (!open) return;
    // clear content fields on open
    reset({ definition: "", note: "" });
    setSelectedTags([]);
    setSuggestions([]);
    setTagQuery("");
    setDifficulty(1);
    setEndDate(null);
  }, [open, reset]);
  // Clear global collapsed state on unmount/close if it belongs to this modal
  useEffect(() => {
    if (!open && addDefCollapsed?.wordId === wordId) clearAddDef();
  }, [open, addDefCollapsed, clearAddDef, wordId]);
  if (!open) return null;

  return (
    <TooltipProvider>
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        {!collapsed && (
          <button
            type="button"
            className="absolute inset-0 bg-black/40 pointer-events-auto"
            onKeyDown={(e) => {
              if (e.key === "Escape") onOpenChange(false);
            }}
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          />
        )}
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
          <div className="pointer-events-auto relative z-10 w-[min(700px,calc(100vw-2rem))] rounded-lg border bg-background p-4 shadow-lg">
            <div className="text-lg font-medium mb-3 flex items-center justify-between">
              <span>{t("addDefinition")}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={t("collapse")}
                    onClick={() => {
                      setCollapsed(true);
                      collapseAddDef({ wordId, wordText });
                    }}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("collapse")}</TooltipContent>
              </Tooltip>
            </div>
            <div className="grid gap-3">
              {wordText && (
                <div className="text-xs text-muted-foreground">
                  {t("word")}:{" "}
                  <span className="text-foreground font-medium">
                    {wordText}
                  </span>
                </div>
              )}
              <div className="grid gap-1">
                <span
                  className="text-sm text-muted-foreground"
                  id={`${defId}-label`}
                >
                  {t("definition")}
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    id={defId}
                    aria-labelledby={`${defId}-label`}
                    aria-invalid={!!errors.definition}
                    disabled={submitting || genLoading}
                    maxLength={DEF_MAX_LENGTH}
                    {...register("definition")}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0"
                        disabled={
                          genLoading ||
                          submitting ||
                          !wordText ||
                          !(
                            langValue === "ru" ||
                            langValue === "uk" ||
                            langValue === "en"
                          )
                        }
                        onClick={async () => {
                          if (!wordText) return;
                          try {
                            setGenLoading(true);
                            const body = {
                              word: wordText,
                              language:
                                langValue === "ru" ||
                                langValue === "uk" ||
                                langValue === "en"
                                  ? langValue
                                  : "ru",
                              existing: existing.map((e) => e.text),
                              maxLength: DEF_MAX_LENGTH,
                            };
                            const res = await fetcher<{
                              success: boolean;
                              text: string;
                              message?: string;
                            }>("/api/ai/generate-definition", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(body),
                            });
                            if (res?.text) {
                              setValue("definition", res.text, {
                                shouldTouch: true,
                                shouldDirty: true,
                              });
                              toast.success(t("aiGenerated"));
                            } else {
                              toast.error(t("aiError"));
                            }
                          } catch (e: unknown) {
                            const status = (e as { status?: number })?.status;
                            if (status === 401) toast.error(t("aiUnauthorized"));
                            else if (status === 400)
                              toast.error(t("aiNotConfigured"));
                            else toast.error(t("aiError"));
                          } finally {
                            setGenLoading(false);
                          }
                        }}
                        aria-label={t("generateWithAiTooltip")}
                      >
                        {genLoading ? (
                          <span className="inline-flex items-center gap-2">
                            <Sparkles className="size-4 animate-pulse" />
                            {t("generating")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Sparkles className="size-4" />
                            {t("generateWithAi")}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("generateWithAiTooltip")}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {errors.definition ? (
                      <span className="text-destructive">
                        {errors.definition.message}
                      </span>
                    ) : null}
                  </span>
                  <span>
                    {t("charsCount", {
                      count: (defValue?.length ?? 0).toString(),
                      max: DEF_MAX_LENGTH,
                    })}
                  </span>
                </div>
                {/* Similar/duplicate suggestions */}
                {similarMatches.length > 0 && (
                  <div className="mt-1 rounded-md border bg-accent/20 p-2 text-xs">
                    <div className="mb-1 font-medium">
                      {t("similarDefsTitle", {
                        percent: SIMILARITY_CONFIG.nearThreshold,
                      })}
                    </div>
                    <ul className="grid gap-1">
                      {similarMatches.map((m) => (
                        <li key={m.id} className="flex items-start gap-2">
                          <span className="shrink-0 min-w-12 font-mono tabular-nums">
                            {m.percent.toFixed(2)}%
                          </span>
                          <span className="inline-block rounded px-1 py-0.5 text-[10px] uppercase tracking-wide bg-secondary text-secondary-foreground">
                            {m.kind === "duplicate"
                              ? t("similarDefsDuplicate", {
                                  default: "duplicate",
                                })
                              : t("similarDefsSimilar", { default: "similar" })}
                          </span>
                          <span className="flex-1 break-words">{m.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <span
                  className="text-sm text-muted-foreground"
                  id={`${noteId}-label`}
                >
                  {t("note")}
                </span>
                <Input
                  id={noteId}
                  aria-labelledby={`${noteId}-label`}
                  disabled={submitting}
                  {...register("note")}
                />
              </div>
              <div className="grid gap-2 grid-cols-1 md:grid-cols-[5rem_10rem_1fr] items-end">
                <div className="grid gap-1 w-full min-w-0">
                  <span className="text-sm text-muted-foreground">
                    {t("difficultyFilterLabel")}
                  </span>
                  <Select
                    value={String(difficulty)}
                    onValueChange={(v) => setDifficulty(Number.parseInt(v, 10))}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-label={t("difficultyFilterLabel")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(difficulties.length
                        ? difficulties
                        : [1, 2, 3, 4, 5]
                      ).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1 w-full min-w-0">
                  <span className="text-sm text-muted-foreground">
                    {t("endDate")}
                  </span>
                  <DateField
                    id={endId}
                    label={undefined}
                    value={endDate}
                    onChange={(d) => setEndDate(d)}
                    placeholder={t("noLimit")}
                    captionLayout="dropdown"
                    buttonClassName="w-full justify-start"
                    formatLabel={(d) => f.dateTime(d, { dateStyle: "medium" })}
                    clearText={t("clear")}
                  />
                </div>
                <div className="grid gap-1 w-full min-w-0">
                  <span
                    className="text-sm text-muted-foreground"
                    id={`${tagInputId}-label`}
                  >
                    {t("tags")}
                  </span>
                  <div>
                    <input
                      id={tagInputId}
                      aria-labelledby={`${tagInputId}-label`}
                      className="w-full px-3 py-2 border rounded text-sm bg-background"
                      placeholder={t("addTagsPlaceholder")}
                      value={tagQuery}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTagQuery(v);
                        const found = suggestions.find(
                          (s) => s.name.toLowerCase() === v.toLowerCase(),
                        );
                        if (found) {
                          addTag(found);
                          setSuggestions([]);
                        }
                      }}
                      list={`tags-suggest-${wordId}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canCreateTag) {
                          e.preventDefault();
                          void createTagByName(tagQuery);
                          setTagQuery("");
                        }
                      }}
                    />
                    <datalist id={`tags-suggest-${wordId}`}>
                      {suggestions.map((s) => (
                        <option
                          key={s.id}
                          value={s.name}
                          onClick={() => addTag(s)}
                        />
                      ))}
                    </datalist>
                    {/* clickable suggestions list for better UX */}
                    {suggestions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {suggestions.map((s) => (
                          <Badge
                            key={s.id}
                            variant="outline"
                            className="cursor-pointer"
                            onClick={() => addTag(s)}
                          >
                            <span className="mb-1 h-3">{s.name}</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                    {canCreateTag && (
                      <div className="mt-2">
                        <button
                          type="button"
                          className="px-2 py-1 text-xs rounded border hover:bg-accent"
                          onClick={() => createTagByName(tagQuery)}
                        >
                          {t("createTagNamed", { name: tagQuery })}
                        </button>
                      </div>
                    )}
                    {selectedTags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedTags.map((t) => (
                          <Badge
                            key={t.id}
                            variant="secondary"
                            className="gap-1"
                          >
                            <span className="mb-1 h-3">{t.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              className="inline-flex h-4 w-4 items-center justify-center p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => removeTag(t.id)}
                            >
                              <X className="size-3" aria-hidden />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                {t("cancel")}
              </Button>
              <Button onClick={onCreate} disabled={submitting}>
                {t("create")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
