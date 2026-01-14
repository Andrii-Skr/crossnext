"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DefinitionCarousel } from "@/components/admin/pending/DefinitionCarousel";
import { DefinitionSection } from "@/components/dictionary/add-definition/DefinitionSection";
import { MetaSection } from "@/components/dictionary/add-definition/MetaSection";
import type { Tag } from "@/components/dictionary/add-definition/TagPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toEndOfDayUtcIso } from "@/lib/date";
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
      definitions: [{ definition: "", note: "", difficulty: 1, endDate: null, tags: [] }],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: "definitions" });
  const definitions = watch("definitions");
  const dictLang = useDictionaryStore((s) => s.dictionaryLang);
  const submitting = isSubmitting;

  const { data: difficultiesData } = useDifficulties(open);
  const difficulties = difficultiesData ?? [];
  const defaultDifficulty = difficulties[0] ?? 1;

  const resetForm = () => {
    reset({
      word: "",
      definitions: [{ definition: "", note: "", difficulty: defaultDifficulty, endDate: null, tags: [] }],
    });
    replace([{ definition: "", note: "", difficulty: defaultDifficulty, endDate: null, tags: [] }]);
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const onCreate = handleSubmit(async (values) => {
    const defs = values.definitions.map((d) => ({
      definition: d.definition,
      note: (d.note || "").trim() || undefined,
      tags: d.tags?.map((t) => t.id) ?? [],
      difficulty: d.difficulty ?? defaultDifficulty,
      end_date: toEndOfDayUtcIso(d.endDate ?? null) ?? undefined,
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
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none min-w-0 flex-col overflow-hidden p-0 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-[700px] sm:p-6"
        aria-describedby={undefined}
      >
        <div className="flex-1 min-w-0 overflow-auto p-4 sm:p-0">
          <DialogHeader className="mb-2 sm:mb-0">
            <DialogTitle>{t("new")}</DialogTitle>
          </DialogHeader>
          <div className="sm:hidden mb-3 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button size="sm" onClick={onCreate} disabled={submitting}>
              {t("create")}
            </Button>
          </div>

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
            <div className="flex flex-col gap-3 min-w-0">
              <div className="order-first flex justify-center sm:order-last sm:justify-start">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() =>
                    append({ definition: "", note: "", difficulty: defaultDifficulty, endDate: null, tags: [] })
                  }
                  disabled={submitting}
                >
                  {t("addAnotherDefinition", { default: "Add definition" })}
                </Button>
              </div>
              {fields.length > 0 && (
                <div className="min-w-0 w-full overflow-x-hidden">
                  <DefinitionCarousel
                    className="min-w-0 w-full"
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
                            <DefinitionSection
                              defLabelId={definitionId}
                              inputProps={register(`definitions.${idx}.definition` as const)}
                              disabled={submitting}
                              errorMessage={errors.definitions?.[idx]?.definition?.message}
                              valueLength={current?.definition?.length ?? 0}
                              maxLength={255}
                              genLoading={false}
                              aiDisabled
                              showGenerateButton={false}
                              autoComplete="off"
                              onGenerate={() => {}}
                            />
                            <MetaSection
                              noteLabelId={noteId}
                              noteInput={register(`definitions.${idx}.note` as const)}
                              noteAutoComplete="off"
                              submitting={submitting}
                              difficulty={current?.difficulty ?? 1}
                              difficulties={difficulties}
                              onDifficultyChange={(n) =>
                                setValue(`definitions.${idx}.difficulty`, n, { shouldDirty: true })
                              }
                              endDate={current?.endDate ?? null}
                              onEndDateChange={(d) =>
                                setValue(`definitions.${idx}.endDate`, d ?? null, { shouldDirty: true })
                              }
                              wordId={tagId}
                              selectedTags={currentTags as Tag[]}
                              onAddTag={(tag) => {
                                if (currentTags.some((t) => t.id === tag.id)) return;
                                setValue(`definitions.${idx}.tags`, [...currentTags, tag], { shouldDirty: true });
                              }}
                              onRemoveTag={(id) => {
                                setValue(
                                  `definitions.${idx}.tags`,
                                  currentTags.filter((t) => t.id !== id),
                                  { shouldDirty: true },
                                );
                              }}
                            />
                          </div>
                        ),
                      };
                    })}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-background px-4 py-3 hidden sm:flex sm:border-0 sm:px-0 sm:py-0">
          <Button variant="ghost" onClick={handleCancel} disabled={submitting}>
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
