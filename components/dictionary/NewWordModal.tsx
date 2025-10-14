"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { TagPicker, type Tag } from "@/components/dictionary/add-definition/TagPicker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/fetcher";
import { useDifficulties } from "@/lib/useDifficulties";
import { useDictionaryStore } from "@/store/dictionary";
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
      .min(1, t("definitionRequired", { default: "Definition is required" }))
      .max(255, t("definitionMaxError", { max: 255 })),
    note: z.string().max(512).optional().or(z.literal("")),
  });
  type FormValues = z.input<typeof schema>;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { word: "", definition: "", note: "" },
  });
  const dictLang = useDictionaryStore((s) => s.dictionaryLang);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const submitting = isSubmitting;

  const { data: difficultiesData } = useDifficulties(open);
  const difficulties = difficultiesData ?? [1, 2, 3, 4, 5];

  function addTag(tag: Tag) {
    if (selectedTags.some((t) => t.id === tag.id)) return;
    setSelectedTags((prev) => [...prev, tag]);
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
          language: dictLang,
          tags: selectedTags.map((t) => t.id),
          difficulty,
        }),
      });
      increment({ words: 1, descriptions: 1 });
      toast.success(t("new"));
      onOpenChange(false);
      reset();
      setSelectedTags([]);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>

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
              maxLength={255}
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
          <div className="flex gap-4 items-start">
            <div className="grid gap-1 w-32">
              <span className="text-sm text-muted-foreground">
                {t("difficultyFilterLabel")}
              </span>
              <Select
                value={String(difficulty)}
                onValueChange={(v) => setDifficulty(Number.parseInt(v, 10))}
              >
                <SelectTrigger aria-label={t("difficultyFilterLabel")}>
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
            <div className="grid gap-1 flex-1 min-w-0">
              <TagPicker
                wordId={tagInputId}
                selected={selectedTags}
                onAdd={addTag}
                onRemove={removeTag}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
