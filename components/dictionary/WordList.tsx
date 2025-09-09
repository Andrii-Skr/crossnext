"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/fetcher";
import type { Word } from "./WordItem";
import { Filters, type FiltersValue } from "./Filters";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SquarePen, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

type Page = { items: Word[]; nextCursor: string | null };

export function WordList() {
  const t = useTranslations();
  const [filters, setFilters] = useState<FiltersValue>({ q: "", scope: "both" });
  const [editing, setEditing] = useState<null | { type: "word" | "def"; id: string }>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const key = useMemo(() => ["dictionary", filters] as const, [filters]);
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      fetcher<Page>(`/api/dictionary?q=${encodeURIComponent(filters.q)}&scope=${filters.scope}&tag=${encodeURIComponent(filters.tag ?? "")}&cursor=${pageParam ?? ""}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  useEffect(() => {
    query.refetch({ cancelRefetch: true });
  }, [filters.scope, filters.tag]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  function startEditWord(id: string, current: string) {
    setEditing({ type: "word", id });
    setEditValue(current);
  }
  function startEditDef(id: string, current: string) {
    setEditing({ type: "def", id });
    setEditValue(current);
  }
  function cancelEdit() {
    setEditing(null);
    setEditValue("");
    setSaving(false);
  }
  async function saveEdit() {
    if (!editing) return;
    const value = editValue.trim();
    if (!value) {
      toast.error(t("emptyValue"));
      return;
    }
    try {
      setSaving(true);
      if (editing.type === "word") {
        await fetcher(`/api/dictionary/word/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word_text: value }),
        });
        toast.success(t("wordUpdated"));
      } else {
        await fetcher(`/api/dictionary/def/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text_opr: value }),
        });
        toast.success(t("definitionUpdated"));
      }
      cancelEdit();
      await query.refetch({ cancelRefetch: true });
    } catch (e: any) {
      const msg = e?.message || t("saveError");
      toast.error(msg.includes("403") ? t("forbidden") : msg);
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Filters value={filters} onChange={setFilters} />

      {/* Loader during initial DB request */}
      {query.isPending && (
        <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-transparent" />
          <span className="sr-only">{t("loading")}</span>
        </div>
      )}

      {/* Small loader when refetching on filter changes */}
      {query.isRefetching && !query.isPending && (
        <div className="flex items-center justify-center py-2" role="status" aria-live="polite">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-transparent" />
          <span className="sr-only">{t("refreshing")}</span>
        </div>
      )}

      {/* Two-column layout with space-between (word | definitions) */}
      {!query.isPending && (
        <div role="list" className="grid">
          {/* Header row */}
          <div className="w-full flex items-center px-1 py-2 text-sm text-muted-foreground border-b">
            <div className="w-2/6 shrink-0">{t("word")}</div>
            <div className="w-4/5 min-w-0 pl-4">{t("definitions")}</div>
          </div>

          {items.map((w) => (
            <div key={w.id} role="listitem" className="flex items-start py-3 border-b">
              <div className="w-2/6 shrink-0 px-1">
                {editing?.type === "word" && editing.id === w.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      disabled={saving}
                      autoFocus
                    />
                    <Button size="icon" className="rounded-full" variant="outline" onClick={saveEdit} disabled={saving} aria-label={t("save")}>
                      <Check />
                    </Button>
                    <Button size="icon" className="rounded-full" variant="ghost" onClick={cancelEdit} disabled={saving} aria-label={t("cancel")}>
                      <X />
                    </Button>
                  </div>
                ) : (
                  <div className="group relative font-medium break-words pr-8">
                    {w.word_text}
                    <button
                      type="button"
                      className="absolute right-0 top-0 p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition"
                      onClick={() => startEditWord(w.id, w.word_text)}
                      aria-label={t("editWord")}
                    >
                      <SquarePen className="size-4" aria-hidden />
                      <span className="sr-only">{t("editWord")}</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="w-4/5 min-w-0 pl-4">
                <ul className="grid gap-1">
                  {w.opred_v.map((d) => (
                    <li key={d.id} className="group flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      {editing?.type === "def" && editing.id === d.id ? (
                        <div className="flex w-full items-center gap-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            disabled={saving}
                            autoFocus
                          />
                          <Button size="icon" className="rounded-full" variant="outline" onClick={saveEdit} disabled={saving} aria-label={t("save")}>
                            <Check className="size-4"/>
                          </Button>
                          <Button size="icon" className="rounded-full" variant="ghost" onClick={cancelEdit} disabled={saving} aria-label={t("cancel")}>
                            <X className="size-4"/>
                          </Button>
                        </div>
                      ) : (
                        <div className="flex w-full items-start gap-2">
                          <span className="min-w-0">
                            {d.text_opr}
                            {d.tags.length > 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {d.tags.map((t) => t.tag.name).join(", ")}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="ml-auto p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition"
                            onClick={() => startEditDef(d.id, d.text_opr)}
                            aria-label={t("editDefinition")}
                          >
                            <SquarePen className="size-4" aria-hidden />
                            <span className="sr-only">{t("editDefinition")}</span>
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-center py-4">
        <button
          className="px-4 py-2 border rounded disabled:opacity-50"
          onClick={() => query.fetchNextPage()}
          disabled={!query.hasNextPage || query.isFetchingNextPage}
          aria-live="polite"
        >
          {query.isFetchingNextPage ? t("loading") : query.hasNextPage ? t("loadMore") : t("noData")}
        </button>
      </div>
    </div>
  );
}
