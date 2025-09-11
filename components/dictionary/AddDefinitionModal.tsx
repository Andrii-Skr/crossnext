"use client";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetcher } from "@/lib/fetcher";
import { usePendingStore } from "@/lib/stores/pending";
import { toast } from "sonner";

export function AddDefinitionModal({ wordId, open, onOpenChange }: { wordId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations();
  const increment = usePendingStore((s) => s.increment);
  const [definition, setDefinition] = useState("");
  const [language, setLanguage] = useState<"ru" | "en" | "uk">("ru");
  const [tagQuery, setTagQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: number; name: string }[]>([]);
  const [selectedTags, setSelectedTags] = useState<{ id: number; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!tagQuery) {
      setSuggestions([]);
      return;
    }
    fetcher<{ items: { id: number; name: string }[] }>(`/api/tags?q=${encodeURIComponent(tagQuery)}`)
      .then((d) => !cancelled && setSuggestions(d.items))
      .catch(() => !cancelled && setSuggestions([]));
    return () => {
      cancelled = true;
    };
  }, [tagQuery]);

  const canCreateTag = useMemo(() => {
    const q = tagQuery.trim();
    if (!q) return false;
    const existsInSuggestions = suggestions.some((s) => s.name.toLowerCase() === q.toLowerCase());
    const existsInSelected = selectedTags.some((s) => s.name.toLowerCase() === q.toLowerCase());
    return !existsInSuggestions && !existsInSelected;
  }, [tagQuery, suggestions, selectedTags]);

  async function createTagByName(name: string) {
    const q = name.trim();
    if (!q) return;
    try {
      const created = await fetcher<{ id: number; name: string }>("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: q }),
      });
      addTag(created);
    } catch (e: any) {
      toast.error(e?.message || "Error");
    }
  }

  function addTag(tag: { id: number; name: string }) {
    if (selectedTags.some((t) => t.id === tag.id)) return;
    setSelectedTags((prev) => [...prev, tag]);
    setTagQuery("");
  }
  function removeTag(id: number) {
    setSelectedTags((prev) => prev.filter((t) => t.id !== id));
  }

  async function onCreate() {
    const text = definition.trim();
    if (!text) {
      toast.error(t("emptyValue"));
      return;
    }
    try {
      setSubmitting(true);
      await fetcher(`/api/pending/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId, definition: text, language, tags: selectedTags.map((t) => t.id) }),
      });
      increment({ words: 1, descriptions: 1 });
      toast.success(t("new"));
      onOpenChange(false);
      // reset form
      setDefinition("");
      setLanguage("ru");
      setSelectedTags([]);
      setSuggestions([]);
      setTagQuery("");
    } catch (e: any) {
      toast.error(e?.message || "Error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-[min(700px,calc(100vw-2rem))] rounded-lg border bg-background p-4 shadow-lg">
        <div className="text-lg font-medium mb-3">{t("addDefinition")}</div>
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm text-muted-foreground">{t("definition")}</span>
            <Input value={definition} onChange={(e) => setDefinition(e.target.value)} disabled={submitting} />
          </label>
          <div className="flex gap-4">
            <label className="grid gap-1 w-48">
              <span className="text-sm text-muted-foreground">{t("language")}</span>
              <Select value={language} onValueChange={(v: any) => setLanguage(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">ru</SelectItem>
                  <SelectItem value="uk">uk</SelectItem>
                  <SelectItem value="en">en</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 flex-1">
              <span className="text-sm text-muted-foreground">{t("tags")}</span>
              <div>
                <input
                  className="w-full px-3 py-2 border rounded text-sm bg-background"
                  placeholder={t("addTagsPlaceholder")}
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  list={`tags-suggest-${wordId}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canCreateTag) {
                      e.preventDefault();
                      void createTagByName(tagQuery);
                      setTagQuery("");
                    }
                  }}
                />
                <datalist id={`tags-suggest-${wordId}`}>
                  {suggestions.map((s) => (
                    <option key={s.id} value={s.name} onClick={() => addTag(s)} />
                  ))}
                </datalist>
                {/* clickable suggestions list for better UX */}
                {suggestions.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {suggestions.map((s) => (
                      <button key={s.id} type="button" className="px-2 py-0.5 text-xs rounded border hover:bg-accent" onClick={() => addTag(s)}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
                {canCreateTag && (
                  <div className="mt-2">
                    <button type="button" className="px-2 py-1 text-xs rounded border hover:bg-accent" onClick={() => createTagByName(tagQuery)}>
                      {t("createTagNamed", { name: tagQuery })}
                    </button>
                  </div>
                )}
                {selectedTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedTags.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full border text-xs">
                        {t.name}
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => removeTag(t.id)}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button onClick={onCreate} disabled={submitting}>
            {t("create")}
          </Button>
        </div>
      </div>
    </div>
  );
}
