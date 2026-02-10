"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EndDateSelect } from "@/components/ui/end-date-select";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toEndOfDayUtcIso } from "@/lib/date";
import { fetcher } from "@/lib/fetcher";
import { useDifficulties } from "@/lib/useDifficulties";

export function EditDefinitionModal({
  open,
  onOpenChange,
  defId,
  initialValue,
  initialDifficulty,
  initialEndDate,
  pendingOnly = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defId: string;
  initialValue: string;
  initialDifficulty?: number | null;
  initialEndDate?: string | null;
  pendingOnly?: boolean;
  onSaved?: (result: { pendingCreated: boolean; text: string }) => void;
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

  const [difficulty, setDifficulty] = useState<number | null>(initialDifficulty ?? null);
  const [initialDifficultyValue, setInitialDifficultyValue] = useState<number | null>(initialDifficulty ?? null);
  const [endDate, setEndDate] = useState<Date | null>(initialEndDate ? new Date(initialEndDate) : null);
  const [initialEndDateIso, setInitialEndDateIso] = useState<string | null>(
    toEndOfDayUtcIso(initialEndDate ? new Date(initialEndDate) : null),
  );
  const { data: difficultiesData } = useDifficulties(open);
  const difficultyOptions = difficultiesData ?? [];
  const defaultDifficulty = difficultyOptions[0] ?? 1;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { text_opr: initialValue, note: "" },
    values: { text_opr: initialValue, note: "" },
  });

  useEffect(() => {
    if (!open) return;
    const nextEndDate = initialEndDate ? new Date(initialEndDate) : null;
    const nextDifficulty = initialDifficulty ?? defaultDifficulty;
    setDifficulty(nextDifficulty);
    setInitialDifficultyValue(nextDifficulty);
    setEndDate(nextEndDate);
    setInitialEndDateIso(toEndOfDayUtcIso(nextEndDate));
  }, [open, initialDifficulty, initialEndDate, defaultDifficulty]);

  const currentText = (watch("text_opr") || "").trim();
  const noteValue = (watch("note") || "").trim();
  const normalizedInitialText = initialValue.trim();
  const endDateIso = useMemo(() => toEndOfDayUtcIso(endDate), [endDate]);
  const textChanged = currentText !== normalizedInitialText;
  const difficultyChanged = difficulty !== initialDifficultyValue;
  const endDateChanged = endDateIso !== initialEndDateIso;
  const hasChanges = pendingOnly
    ? textChanged || !!noteValue
    : textChanged || !!noteValue || difficultyChanged || endDateChanged;

  const onSubmit = handleSubmit(async (values) => {
    const trimmedText = values.text_opr.trim();
    const trimmedNote = (values.note || "").trim();
    const pendingChange = trimmedText !== normalizedInitialText || !!trimmedNote;
    const nextDifficulty = difficulty ?? initialDifficultyValue ?? defaultDifficulty;

    if (!pendingChange && (pendingOnly || (!difficultyChanged && !endDateChanged))) {
      onOpenChange(false);
      reset({ text_opr: initialValue, note: "" });
      return;
    }

    try {
      await Promise.all([
        ...(pendingChange
          ? [
              fetcher(`/api/dictionary/def/${defId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text_opr: trimmedText,
                  note: trimmedNote || undefined,
                }),
              }),
            ]
          : []),
        ...(!pendingOnly && difficultyChanged
          ? [
              fetcher(`/api/dictionary/def/${defId}/difficulty`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ difficulty: nextDifficulty }),
              }),
            ]
          : []),
        ...(!pendingOnly && endDateChanged
          ? [
              fetcher(`/api/dictionary/def/${defId}/end-date`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ end_date: endDateIso }),
              }),
            ]
          : []),
      ]);
      onSaved?.({ pendingCreated: pendingChange, text: trimmedText });
      reset({ text_opr: initialValue, note: "" });
      setInitialDifficultyValue(nextDifficulty);
      setInitialEndDateIso(endDateIso);
      onOpenChange(false);
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
        if (!v) {
          reset({ text_opr: initialValue, note: "" });
          const nextEndDate = initialEndDate ? new Date(initialEndDate) : null;
          setEndDate(nextEndDate);
          setInitialEndDateIso(toEndOfDayUtcIso(nextEndDate));
          const nextDifficulty = initialDifficulty ?? defaultDifficulty;
          setDifficulty(nextDifficulty);
          setInitialDifficultyValue(nextDifficulty);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[600px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("editDefinition")}</DialogTitle>
        </DialogHeader>
        <div className="sm:hidden mb-2 flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={isSubmitting || !hasChanges}>
            {t("save")}
          </Button>
        </div>
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
          {!pendingOnly && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <span className="text-sm text-muted-foreground">{t("difficultyFilterLabel")}</span>
                <Select
                  value={difficulty !== null ? String(difficulty) : undefined}
                  onValueChange={(v) => setDifficulty(Number.parseInt(v, 10))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger aria-label={t("difficultyFilterLabel")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {difficultyOptions.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <EndDateSelect value={endDate} onChange={setEndDate} label={t("endDate")} disabled={isSubmitting} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="hidden sm:flex">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting || !hasChanges}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
