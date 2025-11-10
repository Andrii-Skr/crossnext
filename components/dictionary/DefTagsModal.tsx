"use client";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toEndOfDayUtcIso } from "@/lib/date";
import { fetcher } from "@/lib/fetcher";
import { useDifficulties } from "@/lib/useDifficulties";
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
  const [removeIds, setRemoveIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [initialDifficulty, setInitialDifficulty] = useState<number | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [initialEndDateIso, setInitialEndDateIso] = useState<string | null>(null);

  const { data: difficultiesData } = useDifficulties(open);
  const difficulties = difficultiesData ?? [1, 2, 3, 4, 5];

  const loadCurrent = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher<{ items: Tag[]; difficulty: number }>(`/api/dictionary/def/${defId}/tags`);
      setTags(res.items);
      setDifficulty(res.difficulty ?? 1);
      setInitialDifficulty(res.difficulty ?? 1);
      // load end date separately
      const end = await fetcher<{ id: string; end_date: string | null }>(`/api/dictionary/def/${defId}/end-date`);
      setInitialEndDateIso(end.end_date);
      setEndDate(end.end_date ? new Date(end.end_date) : null);
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
      setRemoveIds([]);
      setQ("");
      setSuggestions([]);
      setDifficulty(null);
      setInitialDifficulty(null);
      setEndDate(null);
      setInitialEndDateIso(null);
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
      setSelectedIds([]);
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
      setSuggestions((prev) => (prev.some((p) => p.id === created.id) ? prev : [created, ...prev]));
      // keep query equal to created name to keep suggestions visible
      setQ(n);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(msg);
    }
  }

  // note: staging mode; direct attach/remove happens on Save

  function toggleRemove(id: number) {
    setRemoveIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  type Period = "none" | "6m" | "1y" | "2y" | "5y";
  function getPeriodFromEndDate(d: Date | null): Period {
    if (!d) return "none";
    const now = new Date();
    const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
    if (months >= 59) return "5y";
    if (months >= 23) return "2y";
    if (months >= 11) return "1y";
    return "6m";
  }
  function handlePeriodChange(v: Period) {
    if (v === "none") {
      setEndDate(null);
      return;
    }
    const base = new Date();
    const d = new Date(base);
    switch (v) {
      case "6m":
        d.setMonth(d.getMonth() + 6);
        break;
      case "1y":
        d.setFullYear(d.getFullYear() + 1);
        break;
      case "2y":
        d.setFullYear(d.getFullYear() + 2);
        break;
      case "5y":
        d.setFullYear(d.getFullYear() + 5);
        break;
    }
    setEndDate(d);
  }

  async function saveChanges() {
    if (
      selectedIds.length === 0 &&
      removeIds.length === 0 &&
      difficulty === initialDifficulty &&
      toEndOfDayUtcIso(endDate) === initialEndDateIso
    )
      return;
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
        ...(difficulty !== initialDifficulty
          ? [
              fetcher(`/api/dictionary/def/${defId}/difficulty`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ difficulty }),
              }),
            ]
          : []),
        ...(toEndOfDayUtcIso(endDate) !== initialEndDateIso
          ? [
              fetcher(`/api/dictionary/def/${defId}/end-date`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ end_date: toEndOfDayUtcIso(endDate) }),
              }),
            ]
          : []),
      ]);
      await loadCurrent();
      setSelectedIds([]);
      setRemoveIds([]);
      setInitialDifficulty(difficulty);
      setInitialEndDateIso(toEndOfDayUtcIso(endDate));
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
        aria-label="Close"
      />
      <div className="relative z-10 w-[min(640px,calc(100vw-2rem))] rounded-lg border bg-background p-4 shadow-lg">
        <div className="text-lg font-medium mb-3">{t("tags")}</div>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <div className="flex gap-3 flex-wrap items-end">
              <div className="grid gap-1 w-32">
                <span className="text-sm text-muted-foreground">{t("difficultyFilterLabel")}</span>
                {loading || difficulty === null || !difficultiesData ? (
                  <div className="h-9 w-full rounded-md bg-muted animate-pulse" />
                ) : (
                  <Select
                    value={difficulty !== null ? String(difficulty) : undefined}
                    onValueChange={(v) => setDifficulty(Number.parseInt(v, 10))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {difficulties.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid gap-1 w-48">
                <span className="text-sm text-muted-foreground">{t("endDate")}</span>
                {loading ? (
                  <div className="h-9 w-full rounded-md bg-muted animate-pulse" />
                ) : (
                  <Select value={getPeriodFromEndDate(endDate)} onValueChange={(v) => handlePeriodChange(v as Period)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("noLimit")}</SelectItem>
                      <SelectItem value="6m">{t("period6months")}</SelectItem>
                      <SelectItem value="1y">{t("period1year")}</SelectItem>
                      <SelectItem value="2y">{t("period2years")}</SelectItem>
                      <SelectItem value="5y">{t("period5years")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
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
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {suggestions.map((s) => {
                  const attached = tags.some((t) => t.id === s.id);
                  const selected = selectedIds.includes(s.id);
                  return (
                    <Badge
                      key={s.id}
                      variant={selected ? "secondary" : "outline"}
                      className={`cursor-pointer ${attached ? "opacity-50 pointer-events-none" : ""}`}
                      onClick={() =>
                        setSelectedIds((prev) =>
                          prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                        )
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
                  const label = s?.name ?? String(id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1">
                      <span className="mb-1 h-3">{label}</span>
                      <Button
                        type="button"
                        variant={"ghost"}
                        className="inline-flex h-4 w-4 items-center justify-center p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedIds((prev) => prev.filter((x) => x !== id))}
                        aria-label="Unselect tag"
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
                  aria-label="Toggle remove"
                >
                  <X className="size-3" aria-hidden />
                </Button>
              </Badge>
            ))}
            {loading && <span className="text-xs text-muted-foreground">…</span>}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={saveChanges}
            disabled={
              saving ||
              loading ||
              (selectedIds.length === 0 &&
                removeIds.length === 0 &&
                difficulty !== null &&
                initialDifficulty !== null &&
                difficulty === initialDifficulty)
            }
          >
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
