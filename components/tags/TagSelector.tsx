"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

export type TagOption = { id: number; name: string };

type TagSelectorProps = {
  selected: TagOption[];
  onChange: (next: TagOption[]) => void;
  inputId?: string;
  labelKey?: string;
  placeholderKey?: string;
  createLabelKey?: string;
  hiddenInputName?: string;
  inputSize?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
  inputClassName?: string;
};

export function TagSelector({
  selected,
  onChange,
  inputId,
  labelKey = "tags",
  placeholderKey = "addTagsPlaceholder",
  createLabelKey = "createTagNamed",
  hiddenInputName,
  inputSize = "md",
  showLabel = true,
  className,
  inputClassName,
}: TagSelectorProps) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TagOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    fetcher<{ items: TagOption[] }>(`/api/tags?q=${encodeURIComponent(q)}`)
      .then((d) => {
        if (!cancelled) {
          const selectedIds = new Set(selected.map((s) => s.id));
          setSuggestions(d.items.filter((s) => !selectedIds.has(s.id)));
        }
      })
      .catch(() => !cancelled && setSuggestions([]));
    return () => {
      cancelled = true;
    };
  }, [query, selected]);

  const canCreate = useMemo(() => {
    const q = query.trim();
    if (!q) return false;
    const lower = q.toLowerCase();
    const existsInSuggestions = suggestions.some((s) => s.name.toLowerCase() === lower);
    const existsInSelected = selected.some((s) => s.name.toLowerCase() === lower);
    return !existsInSuggestions && !existsInSelected;
  }, [query, suggestions, selected]);

  function addTag(tag: TagOption) {
    if (selected.some((s) => s.id === tag.id)) return;
    onChange([...selected, tag]);
    setQuery("");
    setSuggestions([]);
  }

  function removeTag(id: number) {
    if (!selected.some((s) => s.id === id)) return;
    onChange(selected.filter((s) => s.id !== id));
  }

  async function createTagByName(name: string) {
    const q = name.trim().toLowerCase();
    if (!q) return;
    const created = await fetcher<TagOption>("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: q }),
    });
    addTag(created);
  }

  const inputClass = inputSize === "sm" ? "h-9 text-xs" : undefined;

  return (
    <div className={cn("grid gap-1 w-full min-w-0", className)}>
      {showLabel && (
        <span className="text-sm text-muted-foreground" id={inputId ? `${inputId}-label` : undefined}>
          {t(labelKey)}
        </span>
      )}
      <div>
        <Input
          id={inputId}
          aria-labelledby={showLabel && inputId ? `${inputId}-label` : undefined}
          className={cn("w-full", inputClass, inputClassName)}
          placeholder={t(placeholderKey)}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value.toLowerCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreate) {
              e.preventDefault();
              void createTagByName(query);
            }
          }}
        />
        {suggestions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <Badge key={s.id} variant="outline" className="cursor-pointer" onClick={() => addTag(s)}>
                <span className="mb-1 h-3">{s.name}</span>
              </Badge>
            ))}
          </div>
        )}
        {canCreate && (
          <div className="mt-2">
            <button
              type="button"
              className="px-2 py-1 text-xs rounded border hover:bg-accent"
              onClick={() => void createTagByName(query)}
            >
              {t(createLabelKey, { name: query })}
            </button>
          </div>
        )}
        {selected.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {selected.map((tItem) => (
              <Badge key={tItem.id} variant="secondary" className="gap-1">
                <span className="mb-1 h-3">{tItem.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="inline-flex h-4 w-4 items-center justify-center p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => removeTag(tItem.id)}
                  aria-label={t("delete")}
                >
                  <X className="size-3" aria-hidden />
                </Button>
              </Badge>
            ))}
          </div>
        )}
        {hiddenInputName ? (
          <input type="hidden" name={hiddenInputName} value={JSON.stringify(selected.map((t) => t.id))} readOnly />
        ) : null}
      </div>
    </div>
  );
}
