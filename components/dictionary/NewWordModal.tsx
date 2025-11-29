"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DefinitionCarousel } from "@/components/admin/pending/DefinitionCarousel";
import { type Tag, TagPicker } from "@/components/dictionary/add-definition/TagPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetcher } from "@/lib/fetcher";
import { useDifficulties } from "@/lib/useDifficulties";
import { useDictionaryStore } from "@/store/dictionary";
import { usePendingStore } from "@/store/pending";

export function NewWordModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations();
  const increment = usePendingStore((s) => s.increment);
  // Form: RHF + Zod schema with normalization (trim spaces, lowercase)
  const normalizeWord = (input: string) => input.replace(/\s+/g, "").toLowerCase();
  const schema = z.object({
    word: z
      .string()
      .min(1, t("wordRequired", { default: "Word is required" }))
      .transform((v) => normalizeWord(v))
      .refine((v) => /^\p{L}+$/u.test(v), t("wordOnlyLetters", { default: "Only letters allowed" })),
    definitions: z
      .array(
        z.object({
          definition: z
            .string()
            .trim()
            .min(1, t("definitionRequired", { default: "Definition is required" }))
            .max(255, t("definitionMaxError", { max: 255 })),
          note: z.string().max(512).optional().or(z.literal("")),
          difficulty: z.number().int().min(0).default(1),
          tags: z.array(z.object({ id: z.number(), name: z.string() })).default([]),
        }),
      )
      .min(1),
  });
  type FormValues = z.input<typeof schema>;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
    control,
    watch,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      word: "",
      definitions: [{ definition: "", note: "", difficulty: 1, tags: [] }],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: "definitions" });
  const definitions = watch("definitions");
  const dictLang = useDictionaryStore((s) => s.dictionaryLang);
  const submitting = isSubmitting;

  const { data: difficultiesData } = useDifficulties(open);
  const difficulties = difficultiesData ?? [1, 2, 3, 4, 5];

  const resetForm = () => {
    reset({
      word: "",
      definitions: [{ definition: "", note: "", difficulty: 1, tags: [] }],
    });
    replace([{ definition: "", note: "", difficulty: 1, tags: [] }]);
  };

  const onCreate = handleSubmit(async (values) => {
    const defs = values.definitions.map((d) => ({
      definition: d.definition,
      note: (d.note || "").trim() || undefined,
      tags: d.tags?.map((t) => t.id) ?? [],
      difficulty: d.difficulty ?? 1,
    }));
    if (!defs.length) {
      setError("definitions", { message: t("definitionRequired", { default: "Definition is required" }) });
      return;
    }
    try {
      await fetcher(`/api/pending/create-new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: values.word,
          definitions: defs,
          language: dictLang,
        }),
      });
      increment({ words: 1, descriptions: defs.length });
      toast.success(t("new"));
      onOpenChange(false);
      resetForm();
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
  const listId = useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-sm text-muted-foreground" id={`${wordId}-label`}>
              {t("word")}
            </span>
            <Input
              id={wordId}
              aria-labelledby={`${wordId}-label`}
              aria-invalid={!!errors.word}
              disabled={submitting}
              autoComplete="off"
              {...register("word")}
            />
            {errors.word && <span className="text-xs text-destructive">{errors.word.message}</span>}
          </div>
          {fields.length > 0 && (
            <DefinitionCarousel
              className="min-w-0"
              labelKey="definitionIndex"
              prevKey="prev"
              nextKey="next"
              items={fields.map((field, idx) => {
                const definitionId = `${listId}-def-${field.id}`;
                const noteId = `${listId}-note-${field.id}`;
                const tagId = `${listId}-tags-${field.id}`;
                const current = definitions?.[idx];
                const currentTags = current?.tags ?? [];
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
                      <div className="grid gap-1">
                        <span className="text-sm text-muted-foreground" id={`${definitionId}-label`}>
                          {t("definition")}
                        </span>
                        <Input
                          id={definitionId}
                          aria-labelledby={`${definitionId}-label`}
                          aria-invalid={!!errors.definitions?.[idx]?.definition}
                          disabled={submitting}
                          maxLength={255}
                          autoComplete="off"
                          {...register(`definitions.${idx}.definition` as const)}
                        />
                        {errors.definitions?.[idx]?.definition?.message ? (
                          <span className="text-xs text-destructive">
                            {errors.definitions[idx]?.definition?.message}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t("charsCount", {
                              count: String(current?.definition?.length ?? 0),
                              max: 255,
                            })}
                          </span>
                        )}
                      </div>
                      <div className="grid gap-1">
                        <span className="text-sm text-muted-foreground" id={`${noteId}-label`}>
                          {t("note")}
                        </span>
                        <Input
                          id={noteId}
                          aria-labelledby={`${noteId}-label`}
                          disabled={submitting}
                          autoComplete="off"
                          {...register(`definitions.${idx}.note` as const)}
                        />
                      </div>
                      <div className="flex gap-4 items-start flex-wrap">
                        <div className="grid gap-1 w-32">
                          <span className="text-sm text-muted-foreground">{t("difficultyFilterLabel")}</span>
                          <Select
                            value={String(current?.difficulty ?? 1)}
                            onValueChange={(v) =>
                              setValue(`definitions.${idx}.difficulty`, Number.parseInt(v, 10), { shouldDirty: true })
                            }
                          >
                            <SelectTrigger aria-label={t("difficultyFilterLabel")}>
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
                        <div className="grid gap-1 flex-1 min-w-0">
                          <TagPicker
                            wordId={tagId}
                            selected={currentTags as Tag[]}
                            onAdd={(tag) => {
                              if (currentTags.some((t) => t.id === tag.id)) return;
                              setValue(`definitions.${idx}.tags`, [...currentTags, tag], { shouldDirty: true });
                            }}
                            onRemove={(id) => {
                              setValue(
                                `definitions.${idx}.tags`,
                                currentTags.filter((t) => t.id !== id),
                                { shouldDirty: true },
                              );
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ),
                };
              })}
            />
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => append({ definition: "", note: "", difficulty: 1, tags: [] })}
            disabled={submitting}
          >
            {t("addAnotherDefinition", { default: "Add definition" })}
          </Button>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
            disabled={submitting}
          >
            {t("cancel")}
          </Button>
          <Button onClick={onCreate} disabled={submitting}>
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
