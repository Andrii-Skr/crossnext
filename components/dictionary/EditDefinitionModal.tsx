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

export function EditDefinitionModal({
  open,
  onOpenChange,
  defId,
  initialValue,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defId: string;
  initialValue: string;
  onSaved?: () => void;
}) {
  const t = useTranslations();

  const schema = z.object({
    text_opr: z
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
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { text_opr: initialValue, note: "" },
    values: { text_opr: initialValue, note: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await fetcher(`/api/dictionary/def/${defId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text_opr: values.text_opr.trim(),
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

  const defIdLabel = useId();
  const noteId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset({ text_opr: initialValue, note: "" });
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[600px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("editDefinition")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-sm text-muted-foreground" id={`${defIdLabel}-label`}>
              {t("definition")}
            </span>
            <Input
              id={defIdLabel}
              aria-labelledby={`${defIdLabel}-label`}
              aria-invalid={!!errors.text_opr}
              disabled={isSubmitting}
              maxLength={255}
              {...register("text_opr")}
            />
            {errors.text_opr && <span className="text-xs text-destructive">{errors.text_opr.message}</span>}
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
