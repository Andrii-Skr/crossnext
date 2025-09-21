"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Check,
  CirclePlus,
  Hash,
  SquarePen,
  SquarePlus,
  Trash2,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetcher } from "@/lib/fetcher";
import { useDictionaryStore } from "@/store/dictionary";
import { useUiStore } from "@/store/ui";
import { AddDefinitionModal } from "./AddDefinitionModal";
import { DefTagsModal } from "./DefTagsModal";
import { Filters, type FiltersValue } from "./Filters";
import { NewWordModal } from "./NewWordModal";
import type { Word } from "./WordItem";

type Page = {
  items: Word[];
  nextCursor: string | null;
  total: number;
  totalDefs: number;
};

export function WordList() {
  const t = useTranslations();
  const f = useFormatter();
  type FiltersValueEx = FiltersValue & {
    lenFilterField?: "word" | "def";
    lenMin?: number;
    lenMax?: number;
  };
  const [filters, setFilters] = useState<FiltersValueEx>({
    q: "",
    scope: "word",
    searchMode: "contains",
    // length sort: default None
    lenDir: undefined,
  });
  const [editing, setEditing] = useState<null | {
    type: "word" | "def";
    id: string;
  }>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [openForWord, setOpenForWord] = useState<string | null>(null);
  const [openTagsForDef, setOpenTagsForDef] = useState<string | null>(null);
  const [openNewWord, setOpenNewWord] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    type: "word" | "def";
    id: string;
    text?: string;
  }>(null);
  const [deleting, setDeleting] = useState(false);
  const hasCollapsedAddDef = useUiStore((s) => !!s.addDefCollapsed);
  const dictLang = useDictionaryStore((s) => s.dictionaryLang);
  const key = useMemo(
    () => ["dictionary", filters, dictLang] as const,
    [filters, dictLang],
  );
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => {
      const lenDirParam = filters.lenDir ?? "";
      const lenFieldParam =
        filters.lenFilterField ?? (filters.lenDir ? "word" : "");
      const tagsParams = (filters.tags ?? [])
        .map((n) => `&tags=${encodeURIComponent(n)}`)
        .join("");
      return fetcher<Page>(
        `/api/dictionary?q=${encodeURIComponent(filters.q)}&scope=${
          filters.scope
        }` +
          `&mode=${filters.searchMode ?? "contains"}` +
          `&lenField=${lenFieldParam}` +
          `&lenDir=${lenDirParam}` +
          `&lenFilterField=${filters.lenFilterField ?? ""}` +
          `&lenMin=${filters.lenMin ?? ""}` +
          `&lenMax=${filters.lenMax ?? ""}` +
          `&difficulty=${filters.difficulty ?? ""}` +
          `${tagsParams}` +
          `&lang=${encodeURIComponent(dictLang)}` +
          `&cursor=${pageParam ?? ""}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // Refetch happens automatically via queryKey changes

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const totalDefs = query.data?.pages[0]?.totalDefs ?? 0;

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
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || t("saveError");
      toast.error(msg.includes("403") ? t("forbidden") : msg);
      setSaving(false);
    }
  }
  async function confirmDelete() {
    if (!confirm) return;
    try {
      setDeleting(true);
      if (confirm.type === "word") {
        await fetcher(`/api/dictionary/word/${confirm.id}`, {
          method: "DELETE",
        });
        toast.success(t("wordDeleted"));
      } else {
        await fetcher(`/api/dictionary/def/${confirm.id}`, {
          method: "DELETE",
        });
        toast.success(t("definitionDeleted"));
      }
      setConfirm(null);
      void query.refetch({ cancelRefetch: true });
    } catch (err: unknown) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 403) toast.error(t("forbidden"));
      else toast.error(t("saveError"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <TooltipProvider>
      <div className="grid gap-4">
        <Filters
          value={filters}
          onChange={(v) => setFilters((prev) => ({ ...prev, ...v }))}
        />

        {/* Loader during initial DB request */}
        {query.isPending && (
          <output
            className="flex items-center justify-center py-8"
            aria-live="polite"
          >
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-transparent" />
            <span className="sr-only">{t("loading")}</span>
          </output>
        )}

        {/* Small loader when refetching on filter changes */}
        {query.isRefetching && !query.isPending && (
          <output
            className="flex items-center justify-center py-2"
            aria-live="polite"
          >
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-transparent" />
            <span className="sr-only">{t("refreshing")}</span>
          </output>
        )}

        {/* Two-column layout with space-between (word | definitions) */}
        {!query.isPending && (
          <div className="grid">
            {/* Header row */}
            <div className="w-full flex items-center px-1 py-2 text-sm text-muted-foreground border-b">
              <div className="w-2/6 shrink-0 flex items-center gap-2">
                <span>
                  {t("word")}{" "}
                  <span className="text-muted-foreground">
                    {t("countSuffix", { count: f.number(total) })}
                  </span>
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                      onClick={() => setOpenNewWord(true)}
                      aria-label={t("new")}
                    >
                      <SquarePlus className="size-4" aria-hidden />
                      <span className="sr-only">{t("new")}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t("new")}</TooltipContent>
                </Tooltip>
              </div>
              <div className="w-4/5 min-w-0 pl-4">
                {t("definitions")}{" "}
                <span className="text-muted-foreground">
                  {t("countSuffix", { count: f.number(totalDefs) })}
                </span>
              </div>
            </div>

            <ul>
              {items.map((w) => (
                <li key={w.id} className="flex items-start py-3 border-b">
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
                        <Button
                          size="icon"
                          className="rounded-full"
                          variant="outline"
                          onClick={saveEdit}
                          disabled={saving}
                          aria-label={t("save")}
                        >
                          <Check />
                        </Button>
                        <Button
                          size="icon"
                          className="rounded-full"
                          variant="ghost"
                          onClick={cancelEdit}
                          disabled={saving}
                          aria-label={t("cancel")}
                        >
                          <X />
                        </Button>
                      </div>
                    ) : (
                      <div className="group relative font-medium break-words pr-16">
                        {w.word_text}
                        <div className="absolute right-0 top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                                onClick={() => {
                                  if (hasCollapsedAddDef) {
                                    toast.warning(
                                      t("minimizedAddDefinitionExists"),
                                    );
                                    return;
                                  }
                                  setOpenForWord(w.id);
                                }}
                                aria-label={t("addDefinition")}
                              >
                                <CirclePlus className="size-4" aria-hidden />
                                <span className="sr-only">
                                  {t("addDefinition")}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("addDefinition")}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                                onClick={() => startEditWord(w.id, w.word_text)}
                                aria-label={t("editWord")}
                              >
                                <SquarePen className="size-4" aria-hidden />
                                <span className="sr-only">{t("editWord")}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{t("editWord")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                                onClick={() =>
                                  setConfirm({
                                    type: "word",
                                    id: w.id,
                                    text: w.word_text,
                                  })
                                }
                                aria-label={t("delete")}
                              >
                                <Trash2 className="size-4" aria-hidden />
                                <span className="sr-only">{t("delete")}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{t("delete")}</TooltipContent>
                          </Tooltip>
                        </div>
                        <AddDefinitionModal
                          wordId={w.id}
                          open={openForWord === w.id}
                          onOpenChange={(v) => setOpenForWord(v ? w.id : null)}
                          existing={w.opred_v.map((d) => ({
                            id: d.id,
                            text: d.text_opr,
                          }))}
                          wordText={w.word_text}
                        />
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
                              <Button
                                size="icon"
                                className="rounded-full"
                                variant="outline"
                                onClick={saveEdit}
                                disabled={saving}
                                aria-label={t("save")}
                              >
                                <Check className="size-4" />
                              </Button>
                              <Button
                                size="icon"
                                className="rounded-full"
                                variant="ghost"
                                onClick={cancelEdit}
                                disabled={saving}
                                aria-label={t("cancel")}
                              >
                                <X className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex w-full items-start gap-2">
                              <span className="min-w-0">
                                {d.text_opr}
                                {d.end_date ? (
                                  <Badge variant="secondary" className="ml-2">
                                    {t("until", {
                                      value: f.dateTime(new Date(d.end_date), {
                                        dateStyle: "short",
                                      }),
                                    })}
                                  </Badge>
                                ) : null}
                                {d.tags.length > 0 && (
                                  <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                                    {d.tags.map((t) => (
                                      <Badge key={t.tag.id} variant="outline">
                                        <span className="mb-1 h-3">
                                          {t.tag.name}
                                        </span>
                                      </Badge>
                                    ))}
                                  </span>
                                )}
                              </span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="ml-auto p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition"
                                    onClick={() => setOpenTagsForDef(d.id)}
                                    aria-label={t("manageTags")}
                                  >
                                    <Hash className="size-4" aria-hidden />
                                    <span className="sr-only">
                                      {t("manageTags")}
                                    </span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("manageTags")}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition"
                                    onClick={() =>
                                      startEditDef(d.id, d.text_opr)
                                    }
                                    aria-label={t("editDefinition")}
                                  >
                                    <SquarePen className="size-4" aria-hidden />
                                    <span className="sr-only">
                                      {t("editDefinition")}
                                    </span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("editDefinition")}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition"
                                    onClick={() =>
                                      setConfirm({
                                        type: "def",
                                        id: d.id,
                                        text: d.text_opr,
                                      })
                                    }
                                    aria-label={t("delete")}
                                  >
                                    <Trash2 className="size-4" aria-hidden />
                                    <span className="sr-only">
                                      {t("delete")}
                                    </span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>{t("delete")}</TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                          <DefTagsModal
                            defId={d.id}
                            open={openTagsForDef === d.id}
                            onOpenChange={(v) =>
                              setOpenTagsForDef(v ? d.id : null)
                            }
                            onSaved={() =>
                              query.refetch({ cancelRefetch: true })
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-center py-4">
          <button
            type="button"
            className="px-4 py-2 border rounded disabled:opacity-50"
            onClick={() => query.fetchNextPage()}
            disabled={!query.hasNextPage || query.isFetchingNextPage}
            aria-live="polite"
          >
            {query.isFetchingNextPage
              ? t("loading")
              : query.hasNextPage
                ? t("loadMore")
                : t("noData")}
          </button>
        </div>
        <NewWordModal open={openNewWord} onOpenChange={setOpenNewWord} />
      </div>
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.type === "word"
                ? t("confirmDeleteWordTitle")
                : t("confirmDeleteDefTitle")}
            </DialogTitle>
            <DialogDescription>
              {confirm?.type === "word"
                ? t("confirmDeleteWordDesc")
                : t("confirmDeleteDefDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirm(null)}
              disabled={deleting}
            >
              {t("cancel")}
            </Button>
            <Button onClick={confirmDelete} disabled={deleting}>
              {t("yes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
