"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type TagOption, TagSelector } from "@/components/tags/TagSelector";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/fetcher";

export function DefTagsModal({
  defId,
  open,
  onOpenChange,
  onSaved,
}: {
  defId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [initialTags, setInitialTags] = useState<TagOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [saving, setSaving] = useState(false);

  const saveDisabled = useMemo(() => {
    const initialIds = new Set(initialTags.map((t) => t.id));
    const currentIds = new Set(tags.map((t) => t.id));
    const additions = tags.filter((t) => !initialIds.has(t.id));
    const removals = initialTags.filter((t) => !currentIds.has(t.id));
    return saving || loading || (additions.length === 0 && removals.length === 0);
  }, [initialTags, tags, loading, saving]);

  const loadCurrent = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher<{ items: TagOption[] }>(`/api/dictionary/def/${defId}/tags`);
      setInitialTags(res.items);
      setTags(res.items);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [defId]);

  useEffect(() => {
    if (open) {
      // Reset transient UI and show loading before fetching fresh data
      setInitialTags([]);
      setTags([]);
      setLoading(true);
      void loadCurrent();
    } else {
      // clear staged state when closing
      setInitialTags([]);
      setTags([]);
    }
  }, [open, loadCurrent]);

  async function saveChanges() {
    const initialIds = new Set(initialTags.map((t) => t.id));
    const currentIds = new Set(tags.map((t) => t.id));
    const additions = tags.filter((t) => !initialIds.has(t.id));
    const removals = initialTags.filter((t) => !currentIds.has(t.id));
    if (additions.length === 0 && removals.length === 0) return;
    try {
      setSaving(true);
      await Promise.all([
        ...additions.map(({ id: tagId }) =>
          fetcher(`/api/dictionary/def/${defId}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId }),
          }),
        ),
        ...removals.map(({ id: tagId }) =>
          fetcher(`/api/dictionary/def/${defId}/tags?tagId=${tagId}`, {
            method: "DELETE",
          }),
        ),
      ]);
      await loadCurrent();
      toast.success(t("save"));
      onOpenChange(false);
      onSaved?.();
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <Button
        type="button"
        className="absolute inset-0 bg-black/40"
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
        onClick={() => onOpenChange(false)}
        aria-label={t("close")}
      />
      <div className="relative z-10 w-[min(640px,calc(100vw-2rem))] rounded-lg border bg-background p-4 shadow-lg">
        <div className="mb-3 flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-lg font-medium text-center sm:text-left">{t("tags")}</div>
          <div className="flex justify-center gap-2 sm:hidden">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button size="sm" onClick={saveChanges} disabled={saveDisabled}>
              {t("save")}
            </Button>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <TagSelector
              selected={tags}
              onChange={(next) => setTags(next)}
              labelKey="tags"
              placeholderKey="addTagsPlaceholder"
              createLabelKey="createTagNamed"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {tags.map((tg) => (
              <div key={tg.id} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
                <span className="mb-1 h-3">{tg.name}</span>
                <Button
                  type="button"
                  variant={"ghost"}
                  className="inline-flex h-4 w-4 items-center justify-center p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setTags((prev) => prev.filter((t) => t.id !== tg.id))}
                  aria-label={t("delete")}
                >
                  ×
                </Button>
              </div>
            ))}
            {loading && <span className="text-xs text-muted-foreground">…</span>}
          </div>
        </div>
        <div className="mt-4 hidden sm:flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={saveChanges} disabled={saveDisabled}>
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
