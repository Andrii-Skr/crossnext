"use client";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/fetcher";

export type Tag = { id: number; name: string };

export function TagPicker({
  wordId,
  selected,
  onAdd,
  onRemove,
}: {
  wordId: string;
  selected: Tag[];
  onAdd: (t: Tag) => void;
  onRemove: (id: number) => void;
}) {
  const t = useTranslations();
  const [tagQuery, setTagQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!tagQuery) {
      setSuggestions([]);
      return;
    }
    fetcher<{ items: Tag[] }>(`/api/tags?q=${encodeURIComponent(tagQuery)}`)
      .then((d) => !cancelled && setSuggestions(d.items))
      .catch(() => !cancelled && setSuggestions([]));
    return () => {
      cancelled = true;
    };
  }, [tagQuery]);

  const canCreateTag = useMemo(() => {
    const q = tagQuery.trim();
    if (!q) return false;
    const existsInSuggestions = suggestions.some(
      (s) => s.name.toLowerCase() === q.toLowerCase(),
    );
    const existsInSelected = selected.some(
      (s) => s.name.toLowerCase() === q.toLowerCase(),
    );
    return !existsInSuggestions && !existsInSelected;
  }, [tagQuery, suggestions, selected]);

  async function createTagByName(name: string) {
    const q = name.trim();
    if (!q) return;
    const created = await fetcher<Tag>("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: q }),
    });
    onAdd(created);
    setTagQuery("");
    setSuggestions([]);
  }

  return (
    <div className="grid gap-1 w-full min-w-0">
      <span
        className="text-sm text-muted-foreground"
        id={`tag-input-${wordId}-label`}
      >
        {t("tags")}
      </span>
      <div>
        <input
          id={`tag-input-${wordId}`}
          aria-labelledby={`tag-input-${wordId}-label`}
          className="w-full px-3 py-2 border rounded text-sm bg-background"
          placeholder={t("addTagsPlaceholder")}
          value={tagQuery}
          onChange={(e) => {
            const v = e.target.value;
            setTagQuery(v);
            const found = suggestions.find(
              (s) => s.name.toLowerCase() === v.toLowerCase(),
            );
            if (found) {
              onAdd(found);
              setSuggestions([]);
              setTagQuery("");
            }
          }}
          list={`tags-suggest-${wordId}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreateTag) {
              e.preventDefault();
              void createTagByName(tagQuery);
            }
          }}
        />
        <datalist id={`tags-suggest-${wordId}`}>
          {suggestions.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        {suggestions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <Badge
                key={s.id}
                variant="outline"
                className="cursor-pointer"
                onClick={() => onAdd(s)}
              >
                <span className="mb-1 h-3">{s.name}</span>
              </Badge>
            ))}
          </div>
        )}
        {canCreateTag && (
          <div className="mt-2">
            <button
              type="button"
              className="px-2 py-1 text-xs rounded border hover:bg-accent"
              onClick={() => void createTagByName(tagQuery)}
            >
              {t("createTagNamed", { name: tagQuery })}
            </button>
          </div>
        )}
        {selected.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {selected.map((t) => (
              <Badge key={t.id} variant="secondary" className="gap-1">
                <span className="mb-1 h-3">{t.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="inline-flex h-4 w-4 items-center justify-center p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => onRemove(t.id)}
                >
                  <X className="size-3" aria-hidden />
                </Button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
