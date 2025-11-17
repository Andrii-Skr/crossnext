"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/fetcher";

export function EditWordModal({
  open,
  onOpenChange,
  wordId,
  initialValue,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wordId: string;
  initialValue: string;
  onSaved?: () => void;
}) {
  const t = useTranslations();

  const schema = z.object({
    word_text: z.string().min(1, t("wordRequired", { default: "Word is required" })),
    note: z.string().max(512).optional().or(z.literal("")),
  });
  type FormValues = z.input<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { word_text: initialValue, note: "" },
    values: { word_text: initialValue, note: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await fetcher(`/api/dictionary/word/${wordId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word_text: values.word_text.trim(),
          note: (values.note || "").trim() || undefined,
        }),
      });
      onSaved?.();
      onOpenChange(false);
      reset();
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || t("saveError");
      toast.error(msg.includes("403") ? t("forbidden") : msg);
    }
  });

  const wordIdLabel = useId();
  const noteId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset({ word_text: initialValue, note: "" });
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[600px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("editWord")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-sm text-muted-foreground" id={`${wordIdLabel}-label`}>
              {t("word")}
            </span>
            <Input
              id={wordIdLabel}
              aria-labelledby={`${wordIdLabel}-label`}
              aria-invalid={!!errors.word_text}
              disabled={isSubmitting}
              {...register("word_text")}
            />
            {errors.word_text && <span className="text-xs text-destructive">{errors.word_text.message}</span>}
          </div>
          <div className="grid gap-1">
            <span className="text-sm text-muted-foreground" id={`${noteId}-label`}>
              {t("note")}
            </span>
            <Input id={noteId} aria-labelledby={`${noteId}-label`} disabled={isSubmitting} {...register("note")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
