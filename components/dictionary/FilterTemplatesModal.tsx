"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/fetcher";
import type { DictionaryFilterInput } from "@/types/dictionary-bulk";
import type { FilterStats } from "@/types/dictionary-templates";
import { FilterStatsSummary } from "./FilterStatsSummary";

export function FilterTemplatesModal({
  open,
  onOpenChange,
  filterSnapshot,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filterSnapshot: DictionaryFilterInput;
}) {
  const t = useTranslations();
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t("templateNameRequired"))
          .max(120, t("templateNameMax", { max: 120 })),
      }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
    mode: "onSubmit",
  });

  const [stats, setStats] = useState<FilterStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    if (!open) {
      form.reset({ name: "" });
      setStats(null);
      setStatsError(false);
      setStatsLoading(false);
      return;
    }

    let active = true;
    setStatsLoading(true);
    setStatsError(false);
    fetcher<FilterStats>("/api/dictionary/filter-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filterSnapshot),
    })
      .then((data) => {
        if (!active) return;
        setStats(data);
      })
      .catch(() => {
        if (!active) return;
        setStatsError(true);
        setStats(null);
      })
      .finally(() => {
        if (!active) return;
        setStatsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, filterSnapshot, form]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await fetcher<{ id: number }>("/api/dictionary/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name.trim(), filter: filterSnapshot }),
      });
      toast.success(t("templateSaved"));
      onOpenChange(false);
      form.reset({ name: "" });
    } catch (err: unknown) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 401 || status === 403) {
        toast.error(t("forbidden"));
      } else {
        toast.error(t("templateSaveError"));
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("templateCreateTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("templateNameLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("templateNamePlaceholder")}
                      autoComplete="off"
                      aria-label={t("templateNameLabel")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FilterStatsSummary stats={stats} loading={statsLoading} error={statsError} />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="ghost"
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {t("templateSave")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
