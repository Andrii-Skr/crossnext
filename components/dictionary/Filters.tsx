"use client";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/fetcher";

export type FiltersValue = {
  q: string;
  scope: "word" | "def" | "both";
  tag?: string;
};

export function Filters({ value, onChange }: { value: FiltersValue; onChange: (v: FiltersValue) => void }) {
  const [tagQuery, setTagQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: number; name: string }[]>([]);

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

  const radios = useMemo(() => [
    { id: "both", label: "Both" },
    { id: "word", label: "Word" },
    { id: "def", label: "Definition" },
  ] as const, []);

  return (
    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b p-4 grid gap-3">
      <div className="flex gap-2">
        <Input
          placeholder="Search…"
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          aria-label="Search query"
        />
        <Input
          placeholder="Tag filter"
          value={value.tag ?? ""}
          onChange={(e) => onChange({ ...value, tag: e.target.value || undefined })}
          onInput={(e) => setTagQuery((e.target as HTMLInputElement).value)}
          aria-label="Tag"
          list="tag-suggestions"
        />
        <datalist id="tag-suggestions">
          {suggestions.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
      </div>
      <div className="flex gap-4 items-center text-sm">
        <span className="text-muted-foreground">Scope:</span>
        {radios.map((r) => (
          <label key={r.id} className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              value={r.id}
              checked={value.scope === r.id}
              onChange={() => onChange({ ...value, scope: r.id })}
            />
            {r.label}
          </label>
        ))}
      </div>
    </div>
  );
}

