"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ComponentProps, type MouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";
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
  compact?: boolean;
  onTagContextMenu?: (tag: TagOption, event: MouseEvent) => void;
  getTagBadgeVariant?: (tag: TagOption) => ComponentProps<typeof Badge>["variant"];
  getTagBadgeClassName?: (tag: TagOption) => string | undefined;
  inputTrailing?: ReactNode;
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
  compact = false,
  onTagContextMenu,
  getTagBadgeVariant,
  getTagBadgeClassName,
  inputTrailing,
}: TagSelectorProps) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TagOption[]>([]);
  const inputLabel = t(labelKey);

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
          {inputLabel}
        </span>
      )}
      <div className="space-y-2">
        {compact ? (
          <div className="relative">
            <div className="rounded-md border border-input bg-background px-2 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                {selected.map((tItem) => (
                  <Badge
                    key={tItem.id}
                    variant={getTagBadgeVariant?.(tItem) ?? "secondary"}
                    className={cn("gap-1 shrink-0", getTagBadgeClassName?.(tItem))}
                    onContextMenu={
                      onTagContextMenu
                        ? (event) => {
                            event.preventDefault();
                            onTagContextMenu(tItem, event);
                          }
                        : undefined
                    }
                  >
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
                <div className={cn("relative min-w-[7rem] flex-1", inputTrailing && "pr-6")}>
                  <Input
                    id={inputId}
                    aria-labelledby={showLabel && inputId ? `${inputId}-label` : undefined}
                    aria-label={!showLabel ? inputLabel : undefined}
                    className={cn(
                      "h-8 min-w-[7rem] flex-1 border-none bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
                      inputTrailing ? "pr-6" : undefined,
                      inputClassName,
                    )}
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
                  {inputTrailing && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center">{inputTrailing}</div>
                  )}
                </div>
              </div>
            </div>
            {(suggestions.length > 0 || canCreate) && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-2 shadow-lg space-y-2">
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {suggestions.map((s) => (
                      <Badge key={s.id} variant="outline" className="cursor-pointer" onClick={() => addTag(s)}>
                        <span className="mb-1 h-3">{s.name}</span>
                      </Badge>
                    ))}
                  </div>
                )}
                {canCreate && (
                  <div>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs rounded border hover:bg-accent"
                      onClick={() => void createTagByName(query)}
                    >
                      {t(createLabelKey, { name: query })}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="relative">
              <Input
                id={inputId}
                aria-labelledby={showLabel && inputId ? `${inputId}-label` : undefined}
                aria-label={!showLabel ? inputLabel : undefined}
                className={cn("w-full", inputClass, inputTrailing ? "pr-8" : undefined, inputClassName)}
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
              {inputTrailing && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">{inputTrailing}</div>
              )}
            </div>
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
                  <Badge
                    key={tItem.id}
                    variant={getTagBadgeVariant?.(tItem) ?? "secondary"}
                    className={cn("gap-1", getTagBadgeClassName?.(tItem))}
                    onContextMenu={
                      onTagContextMenu
                        ? (event) => {
                            event.preventDefault();
                            onTagContextMenu(tItem, event);
                          }
                        : undefined
                    }
                  >
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
          </>
        )}
        {hiddenInputName ? (
          <input type="hidden" name={hiddenInputName} value={JSON.stringify(selected.map((t) => t.id))} readOnly />
        ) : null}
      </div>
    </div>
  );
}
