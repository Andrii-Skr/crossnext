"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher } from "@/lib/fetcher";
import { useDifficulties } from "@/lib/useDifficulties";
import { usePendingStore } from "@/stores/pending";
import { Badge } from "@/components/ui/badge";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiStore } from "@/stores/ui";

import type { ExistingDef, Lang } from "@/lib/similarityClient";
import { compareWithPrepared, prepareExisting } from "@/lib/similarityClient";

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
  // RHF + Zod for validation
  const schema = z.object({
    definition: z
      .string()
      .min(1, t("definitionRequired", { default: "Definition is required" })),
    note: z.string().max(512).optional().or(z.literal("")),
    language: z.enum(["ru", "en", "uk"]).default("ru"),
  });
  type FormValues = z.input<typeof schema>;
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { definition: "", note: "", language: "ru" },
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
  const langValue = watch("language");

  // Подготовка кэша существующих определений (зависит только от языка и входного массива)
  const preparedExisting = useMemo(() => {
    return prepareExisting(
      existing.map((e) => ({ id: e.id, text: e.text, lang: (langValue as Lang | undefined) })),
      { /* defaults */ },
    );
  }, [existing, langValue]);

  const [similarMatches, setSimilarMatches] = useState<
    { id: string | number; text: string; percent: number; kind: "duplicate" | "similar" }[]
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
    // compute with nearThreshold=80, duplicateThreshold=85, topK=5
    const res = compareWithPrepared(
      { text, lang: langValue },
      preparedExisting,
      { nearThreshold: 80, duplicateThreshold: 85, topK: 5 },
    );
    const items = res.top
      .filter((i) => i.percent >= 80)
      .map((i) => ({
        ...i,
        kind: i.percent >= 85 ? ("duplicate" as const) : ("similar" as const),
      }));
    setSimilarMatches(items);
  }, [open, defValue, langValue, preparedExisting]);

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
      await fetcher(`/api/pending/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordId,
          definition: values.definition,
          note: (values.note || "").trim() || undefined,
          language: values.language,
          tags: selectedTags.map((t) => t.id),
          difficulty,
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
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(msg);
    }
  });

  const defId = useId();
  const noteId = useId();
  const tagInputId = useId();
  useEffect(() => {
    if (open) setCollapsed(false);
  }, [open]);
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
            <span className="text-sm font-medium">{t("addDefinition")}{wordText ? `: ${wordText}` : ""}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("expand")} onClick={() => { setCollapsed(false); clearAddDef(); }}>
                  <ChevronUp className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("expand")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("cancel")} onClick={() => { onOpenChange(false); clearAddDef(); }}>
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
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("collapse")} onClick={() => { setCollapsed(true); collapseAddDef({ wordId, wordText }); }}>
                <ChevronDown className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("collapse")}</TooltipContent>
          </Tooltip>
        </div>
        <div className="grid gap-3">
          {wordText && (
            <div className="text-xs text-muted-foreground">
              {t("word")}: <span className="text-foreground font-medium">{wordText}</span>
            </div>
          )}
          <div className="grid gap-1">
            <span
              className="text-sm text-muted-foreground"
              id={`${defId}-label`}
            >
              {t("definition")}
            </span>
            <Input
              id={defId}
              aria-labelledby={`${defId}-label`}
              aria-invalid={!!errors.definition}
              disabled={submitting}
              {...register("definition")}
            />
            {errors.definition && (
              <span className="text-xs text-destructive">
                {errors.definition.message}
              </span>
            )}
            {/* Similar/duplicate suggestions */}
            {similarMatches.length > 0 && (
              <div className="mt-1 rounded-md border bg-accent/20 p-2 text-xs">
                <div className="mb-1 font-medium">
                  {t("similarDefsTitle", { default: "Similar definitions (≥80%)" })}
                </div>
                <ul className="grid gap-1">
                  {similarMatches.map((m) => (
                    <li key={m.id} className="flex items-start gap-2">
                      <span className="shrink-0 min-w-12 font-mono tabular-nums">{m.percent.toFixed(2)}%</span>
                      <span className="inline-block rounded px-1 py-0.5 text-[10px] uppercase tracking-wide bg-secondary text-secondary-foreground">
                        {m.kind === "duplicate"
                          ? t("similarDefsDuplicate", { default: "duplicate" })
                          : t("similarDefsSimilar", { default: "similar" })}
                      </span>
                      <span className="flex-1 break-words">{m.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="grid gap-1">
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
          <div className="flex gap-4">
            <div className="grid gap-1 w-48">
              <span className="text-sm text-muted-foreground">
                {t("language")}
              </span>
              <Controller
                control={control}
                name="language"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ru">ru</SelectItem>
                      <SelectItem value="uk">uk</SelectItem>
                      <SelectItem value="en">en</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-1 w-32">
              <span className="text-sm text-muted-foreground">
                {t("difficultyFilterLabel")}
              </span>
              <Select
                value={String(difficulty)}
                onValueChange={(v) => setDifficulty(Number.parseInt(v, 10))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(difficulties.length ? difficulties : [1, 2, 3, 4, 5]).map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1 flex-1">
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
                      <Badge key={t.id} variant="secondary" className="gap-1">
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
