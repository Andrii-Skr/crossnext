"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, RotateCcw, SquarePen, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { getActionErrorMeta } from "@/lib/action-error";
import { fetcher } from "@/lib/fetcher";
import type { DictionaryTemplateItem, DictionaryTemplatesResponse } from "@/types/dictionary-templates";

type AdminTemplateItem = DictionaryTemplateItem & {
  isDeleted?: boolean;
  usageCount?: number;
};

type TemplateDeleteResponse = {
  mode: "soft" | "hard";
  usageCount?: number;
};

type TemplateRestoreResponse = {
  id: number;
  isDeleted: false;
};

type Props = {
  langCode: string;
};

type EditFormValues = {
  name: string;
};

const emptyFormValues: EditFormValues = {
  name: "",
};

export function DictionaryTemplatesAdminClient({ langCode }: Props) {
  const t = useTranslations();
  const f = useFormatter();
  const [templates, setTemplates] = useState<AdminTemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<AdminTemplateItem | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<AdminTemplateItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [restorePendingId, setRestorePendingId] = useState<number | null>(null);

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

  const form = useForm<EditFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyFormValues,
    mode: "onSubmit",
  });

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      params.set("includeDeleted", "1");
      params.set("lang", langCode.toLowerCase());
      const response = await fetcher<DictionaryTemplatesResponse>(`/api/dictionary/templates?${params.toString()}`);
      setTemplates((response.items ?? []) as AdminTemplateItem[]);
    } catch {
      setError(true);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [langCode]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!editingTemplate) {
      form.reset(emptyFormValues);
      return;
    }
    form.reset({ name: editingTemplate.name ?? "" });
  }, [editingTemplate, form]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((template) => {
      const inName = template.name.toLowerCase().includes(q);
      const inQuery = (template.query ?? "").toLowerCase().includes(q);
      const inTags = (template.tagNames ?? []).some((tag) => tag.toLowerCase().includes(q));
      const inExcluded = (template.excludeTagNames ?? []).some((tag) => tag.toLowerCase().includes(q));
      return inName || inQuery || inTags || inExcluded;
    });
  }, [search, templates]);

  const submitEdit = form.handleSubmit(async (values) => {
    if (!editingTemplate) return;

    try {
      await fetcher<{ id: number }>(`/api/dictionary/templates/${editingTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name.trim() }),
      });
      toast.success(t("templateUpdated"));
      setEditingTemplate(null);
      await loadTemplates();
    } catch (error: unknown) {
      const { status } = getActionErrorMeta(error);
      if (status === 403) toast.error(t("forbidden"));
      else toast.error(t("templateUpdateError"));
    }
  });

  const confirmDelete = async () => {
    if (!deleteTemplate) return;

    try {
      setDeletePending(true);
      const response = await fetcher<TemplateDeleteResponse>(`/api/dictionary/templates/${deleteTemplate.id}`, {
        method: "DELETE",
      });
      if (response.mode === "hard") {
        toast.success(t("templateDeletedHard"));
      } else {
        const usageCount =
          typeof response.usageCount === "number" ? response.usageCount : (deleteTemplate.usageCount ?? 0);
        toast.success(t("templateDeletedSoft", { count: f.number(usageCount) }));
      }
      setDeleteTemplate(null);
      await loadTemplates();
    } catch (error: unknown) {
      const { status } = getActionErrorMeta(error);
      if (status === 403) toast.error(t("forbidden"));
      else toast.error(t("templateDeleteError"));
    } finally {
      setDeletePending(false);
    }
  };

  const restoreTemplate = async (template: AdminTemplateItem) => {
    try {
      setRestorePendingId(template.id);
      await fetcher<TemplateRestoreResponse>(`/api/dictionary/templates/${template.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      toast.success(t("templateRestored"));
      await loadTemplates();
    } catch (error: unknown) {
      const { status } = getActionErrorMeta(error);
      if (status === 403) toast.error(t("forbidden"));
      else toast.error(t("templateRestoreError"));
    } finally {
      setRestorePendingId(null);
    }
  };

  const statusBadge = (template: AdminTemplateItem) => {
    if (template.isDeleted) {
      const usageCount = template.usageCount ?? 0;
      if (usageCount > 0) {
        return (
          <Badge variant="secondary">
            {t("templateStatusHiddenInUse", {
              count: f.number(usageCount),
            })}
          </Badge>
        );
      }
      return <Badge variant="secondary">{t("templateStatusHidden")}</Badge>;
    }
    return <Badge variant="outline">{t("templateStatusActive")}</Badge>;
  };

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("templateAdminSearchPlaceholder")}
        aria-label={t("templateAdminSearchPlaceholder")}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span>{t("templateListLoading")}</span>
        </div>
      ) : null}

      {!loading && error ? <div className="text-sm text-destructive">{t("templateAdminLoadError")}</div> : null}

      {!loading && !error && filteredTemplates.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t("templateAdminEmpty")}</div>
      ) : null}

      {!loading && !error && filteredTemplates.length > 0 ? (
        <div className="divide-y rounded-md border">
          {filteredTemplates.map((template) => {
            const isRestorePending = restorePendingId === template.id;
            return (
              <div key={template.id} className="p-3 md:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium break-words">{template.name}</span>
                      {statusBadge(template)}
                      <Badge variant="outline">{template.language}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">
                        {template.scope === "def"
                          ? t("scopeDef")
                          : template.scope === "both"
                            ? t("scopeBoth")
                            : t("scopeWord")}
                      </Badge>
                      <Badge variant="secondary">
                        {template.searchMode === "exact"
                          ? t("searchModeExact")
                          : template.searchMode === "startsWith"
                            ? t("searchModeStartsWith")
                            : t("searchModeContains")}
                      </Badge>
                    </div>
                    {template.query ? (
                      <p className="text-sm text-muted-foreground break-words">{template.query}</p>
                    ) : null}
                    {template.tagNames?.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span>{t("tags")}</span>
                        {template.tagNames.map((tag) => (
                          <Badge key={`${template.id}-tag-${tag}`} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {template.excludeTagNames?.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span>{t("excludedTagsLabel")}</span>
                        {template.excludeTagNames.map((tag) => (
                          <Badge
                            key={`${template.id}-exclude-${tag}`}
                            variant="outline"
                            className="border-destructive/40 text-destructive line-through"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("edit")}
                      onClick={() => setEditingTemplate(template)}
                    >
                      <SquarePen className="size-4" aria-hidden />
                    </Button>
                    {template.isDeleted ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("restore")}
                        onClick={() => void restoreTemplate(template)}
                        disabled={isRestorePending}
                      >
                        {isRestorePending ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <RotateCcw className="size-4" aria-hidden />
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        aria-label={t("delete")}
                        onClick={() => setDeleteTemplate(template)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <Dialog open={Boolean(editingTemplate)} onOpenChange={(open) => (!open ? setEditingTemplate(null) : null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("templateEditTitle")}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submitEdit();
              }}
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("templateNameLabel")}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingTemplate(null)}
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

      <Dialog
        open={Boolean(deleteTemplate)}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleteTemplate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("templateDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {deleteTemplate ? t("templateDeleteDescription", { name: deleteTemplate.name }) : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTemplate(null)} disabled={deletePending}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()} disabled={deletePending}>
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
