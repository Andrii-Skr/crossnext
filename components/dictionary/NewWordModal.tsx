"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
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
import { usePendingStore } from "@/store/pending";

export function NewWordModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations();
  const increment = usePendingStore((s) => s.increment);
  const [difficulty, setDifficulty] = useState<number>(1);
  // Form: RHF + Zod schema with normalization (trim spaces, lowercase)
  const normalizeWord = (input: string) =>
    input.replace(/\s+/g, "").toLowerCase();
  const schema = z.object({
    word: z
      .string()
      .min(1, t("wordRequired", { default: "Word is required" }))
      .transform((v) => normalizeWord(v))
      .refine(
        (v) => /^\p{L}+$/u.test(v),
        t("wordOnlyLetters", { default: "Only letters allowed" }),
      ),
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
    formState: { errors, isSubmitting },
    reset,
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { word: "", definition: "", note: "", language: "ru" },
  });
  const [tagQuery, setTagQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { id: number; name: string }[]
  >([]);
  const [selectedTags, setSelectedTags] = useState<
    { id: number; name: string }[]
  >([]);
  const submitting = isSubmitting;

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
    setSuggestions([]);
  }
  function removeTag(id: number) {
    setSelectedTags((prev) => prev.filter((t) => t.id !== id));
  }

  const onCreate = handleSubmit(async (values) => {
    try {
      await fetcher(`/api/pending/create-new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: values.word,
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
      if (/exists/i.test(msg)) {
        setError("word", {
          message: t("wordExists", { default: "Word already exists" }),
        });
        return;
      }
      if (/letters only/i.test(msg)) {
        setError("word", {
          message: t("wordOnlyLetters", { default: "Only letters allowed" }),
        });
        return;
      }
      toast.error(msg);
    }
  });

  const wordId = useId();
  const defId = useId();
  const noteId = useId();
  const tagInputId = useId();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
        onClick={() => onOpenChange(false)}
        aria-label="Close"
      />
      <div className="relative z-10 w-[min(700px,calc(100vw-2rem))] rounded-lg border bg-background p-4 shadow-lg">
        <div className="text-lg font-medium mb-3">{t("new")}</div>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span
              className="text-sm text-muted-foreground"
              id={`${wordId}-label`}
            >
              {t("word")}
            </span>
            <Input
              id={wordId}
              aria-labelledby={`${wordId}-label`}
              aria-invalid={!!errors.word}
              disabled={submitting}
              {...register("word")}
            />
            {errors.word && (
              <span className="text-xs text-destructive">
                {errors.word.message}
              </span>
            )}
          </div>
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
                  {(difficulties.length ? difficulties : [1, 2, 3, 4, 5]).map(
                    (d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}
                      </SelectItem>
                    ),
                  )}
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
                  list={`new-tags-suggest`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canCreateTag) {
                      e.preventDefault();
                      void createTagByName(tagQuery);
                      setTagQuery("");
                    }
                  }}
                />
                <datalist id={`new-tags-suggest`}>
                  {suggestions.map((s) => (
                    <option
                      key={s.id}
                      value={s.name}
                      onClick={() => addTag(s)}
                    />
                  ))}
                </datalist>
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
    </div>
  );
}
