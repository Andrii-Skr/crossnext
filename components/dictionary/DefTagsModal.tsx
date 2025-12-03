"use client";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

type Tag = { id: number; name: string };

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
  const [tags, setTags] = useState<Tag[]>([]);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<Record<number, string>>({});
  const [removeIds, setRemoveIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const availableSuggestions = useMemo(
    () => suggestions.filter((s) => !tags.some((t) => t.id === s.id)),
    [suggestions, tags],
  );
  const saveDisabled = saving || loading || (selectedIds.length === 0 && removeIds.length === 0);

  const loadCurrent = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher<{ items: Tag[] }>(`/api/dictionary/def/${defId}/tags`);
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
      setTags([]);
      setSelectedIds([]);
      setSelectedLabels({});
      setRemoveIds([]);
      setQ("");
      setSuggestions([]);
      setLoading(true);
      void loadCurrent();
    } else {
      // clear search input when closing
      setQ("");
      setSuggestions([]);
    }
  }, [open, loadCurrent]);

  useEffect(() => {
    let cancelled = false;
    const qq = q.trim();
    if (!qq) {
      setSuggestions([]);
      return;
    }
    fetcher<{ items: Tag[] }>(`/api/tags?q=${encodeURIComponent(qq)}`)
      .then((d) => !cancelled && setSuggestions(d.items))
      .catch(() => !cancelled && setSuggestions([]));
    return () => {
      cancelled = true;
    };
  }, [q]);

  const canCreate = useMemo(() => {
    const name = q.trim();
    if (!name) return false;
    const inSugg = suggestions.some((s) => s.name.toLowerCase() === name.toLowerCase());
    const inSelected = tags.some((s) => s.name.toLowerCase() === name.toLowerCase());
    return !inSugg && !inSelected;
  }, [q, suggestions, tags]);

  async function createTagByName(name: string) {
    const n = name.trim();
    if (!n) return;
    try {
      const created = await fetcher<Tag>("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      // Stage new tag like existing ones; actually attach on Save
      setSelectedIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setSelectedLabels((prev) => ({ ...prev, [created.id]: created.name }));
      setSuggestions((prev) => (prev.some((p) => p.id === created.id) ? prev : [created, ...prev]));
      setQ("");
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(msg);
    }
  }

  // note: staging mode; direct attach/remove happens on Save

  function toggleRemove(id: number) {
    setRemoveIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveChanges() {
    if (selectedIds.length === 0 && removeIds.length === 0) return;
    try {
      setSaving(true);
      await Promise.all([
        ...selectedIds.map((tagId) =>
          fetcher(`/api/dictionary/def/${defId}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId }),
          }),
        ),
        ...removeIds.map((tagId) =>
          fetcher(`/api/dictionary/def/${defId}/tags?tagId=${tagId}`, {
            method: "DELETE",
          }),
        ),
      ]);
      await loadCurrent();
      setSelectedIds([]);
      setRemoveIds([]);
      toast.success(t("save"));
      setQ("");
      setSuggestions([]);
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
            <Input
              placeholder={t("addTagsPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) {
                  e.preventDefault();
                  void createTagByName(q);
                }
              }}
            />
            {availableSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {availableSuggestions.map((s) => {
                  const attached = tags.some((t) => t.id === s.id);
                  const selected = selectedIds.includes(s.id);
                  return (
                    <Badge
                      key={s.id}
                      variant={selected ? "secondary" : "outline"}
                      className={`cursor-pointer ${attached ? "opacity-50 pointer-events-none" : ""}`}
                      onClick={() =>
                        setSelectedIds((prev) => {
                          const next = prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id];
                          setSelectedLabels((prevLabels) => {
                            const nextLabels = { ...prevLabels };
                            if (next.includes(s.id)) nextLabels[s.id] = s.name;
                            else delete nextLabels[s.id];
                            return nextLabels;
                          });
                          setQ("");
                          return next;
                        })
                      }
                    >
                      <span className="mb-1 h-3">{s.name}</span>
                    </Badge>
                  );
                })}
              </div>
            )}
            {canCreate && (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size={"sm"}
                  className="px-2 py-1 text-xs rounded border hover:bg-accent"
                  onClick={() => createTagByName(q)}
                >
                  {t("createTagNamed", { name: q })}
                </Button>
              </div>
            )}
            {selectedIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedIds.map((id) => {
                  const s = suggestions.find((x) => x.id === id);
                  const label = selectedLabels[id] ?? s?.name ?? String(id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1">
                      <span className="mb-1 h-3">{label}</span>
                      <Button
                        type="button"
                        variant={"ghost"}
                        className="inline-flex h-4 w-4 items-center justify-center p-0 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setSelectedIds((prev) => {
                            const next = prev.filter((x) => x !== id);
                            setSelectedLabels((prevLabels) => {
                              const nextLabels = { ...prevLabels };
                              delete nextLabels[id];
                              return nextLabels;
                            });
                            return next;
                          })
                        }
                        aria-label={t("unselectTag")}
                      >
                        <X className="size-3" aria-hidden />
                      </Button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {tags.map((tg) => (
              <Badge
                key={tg.id}
                variant="outline"
                className={cn(removeIds.includes(tg.id) && "opacity-50 line-through")}
              >
                <span className="mb-1 h-3">{tg.name}</span>
                <Button
                  type="button"
                  variant={"ghost"}
                  className="inline-flex h-4 w-4 items-center justify-center p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => toggleRemove(tg.id)}
                  aria-label={t("toggleRemove")}
                >
                  <X className="size-3" aria-hidden />
                </Button>
              </Badge>
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
