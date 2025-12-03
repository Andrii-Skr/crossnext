"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EditDefinitionModal } from "@/components/dictionary/EditDefinitionModal";
import { EditWordModal } from "@/components/dictionary/EditWordModal";
import { fetcher } from "@/lib/fetcher";
import { type DictionaryFilters, useDictionaryStore } from "@/store/dictionary";
import { usePendingStore } from "@/store/pending";
import { Filters, type FiltersValue } from "./Filters";
import { NewWordModal } from "./NewWordModal";
import type { Word } from "./WordItem";
import { ConfirmDeleteDialog } from "./word-list/ConfirmDeleteDialog";
import { LoadMoreButton } from "./word-list/LoadMoreButton";
import { WordListHeader } from "./word-list/WordListHeader";
import { WordRow } from "./word-list/WordRow";

type Page = {
  items: Word[];
  nextCursor: string | null;
  total: number;
  totalDefs: number;
};

export function WordList() {
  const t = useTranslations();
  // Фильтры и действия берём из Zustand стора, чтобы сохранять состояние между переходами
  const filters = useDictionaryStore((s) => s.filters);
  const setFilters = useDictionaryStore((s) => s.setFilters);
  const resetFilters = useDictionaryStore((s) => s.resetFilters);
  const [editWord, setEditWord] = useState<null | { id: string; text: string }>(null);
  const [editDef, setEditDef] = useState<null | {
    id: string;
    text: string;
    difficulty: number | null;
    endDate: string | null;
  }>(null);
  const [openForWord, setOpenForWord] = useState<string | null>(null);
  const [openTagsForDef, setOpenTagsForDef] = useState<string | null>(null);
  const [openNewWord, setOpenNewWord] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    type: "word" | "def";
    id: string;
    text?: string;
  }>(null);
  const [deleting, setDeleting] = useState(false);
  const dictLang = useDictionaryStore((s) => s.dictionaryLang);
  const incrementPending = usePendingStore((s) => s.increment);
  const key = useMemo(() => ["dictionary", filters, dictLang] as const, [filters, dictLang]);
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => {
      const lenDirParam = filters.lenDir ?? "";
      const lenFieldParam = filters.lenFilterField ?? (filters.lenDir ? "word" : "");
      const sortFieldParam = filters.sortField ?? "";
      const sortDirParam = filters.sortDir ?? "";
      const defSortDirParam = filters.defSortDir ?? "";
      const tagsParams = (filters.tags ?? []).map((n) => `&tags=${encodeURIComponent(n)}`).join("");
      return fetcher<Page>(
        `/api/dictionary?q=${encodeURIComponent(filters.q)}&scope=${filters.scope}` +
          `&mode=${filters.searchMode ?? "contains"}` +
          `&lenField=${lenFieldParam}` +
          `&lenDir=${lenDirParam}` +
          `&lenFilterField=${filters.lenFilterField ?? ""}` +
          `&lenMin=${filters.lenMin ?? ""}` +
          `&lenMax=${filters.lenMax ?? ""}` +
          `&sortField=${sortFieldParam}` +
          `&sortDir=${sortDirParam}` +
          `&defSortDir=${defSortDirParam}` +
          `&difficultyMin=${filters.difficultyMin ?? ""}` +
          `&difficultyMax=${filters.difficultyMax ?? ""}` +
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
    setEditWord({ id, text: current });
  }
  function startEditDef(id: string, current: string, difficulty: number | null = null, endDate: string | null = null) {
    setEditDef({ id, text: current, difficulty, endDate });
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

  function toggleWordSort() {
    const nextDir: "asc" | "desc" = filters.sortField === "word" && filters.sortDir === "asc" ? "desc" : "asc";
    setFilters({ sortField: "word", sortDir: nextDir });
  }

  function toggleDefSort() {
    const nextDir: "asc" | "desc" = filters.defSortDir === "asc" ? "desc" : "asc";
    setFilters({ defSortDir: nextDir });
  }

  return (
    <div className="grid gap-4">
      <Filters
        value={filters as unknown as FiltersValue}
        onChange={(v) => setFilters(v as Partial<DictionaryFilters>)}
        onReset={() => resetFilters()}
      />

      {/* Loader during initial DB request */}
      {query.isPending && (
        <output className="flex items-center justify-center py-8" aria-live="polite">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-transparent" />
          <span className="sr-only">{t("loading")}</span>
        </output>
      )}

      {/* Small loader when refetching on filter changes */}
      {query.isRefetching && !query.isPending && (
        <output className="flex items-center justify-center py-2" aria-live="polite">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-transparent" />
          <span className="sr-only">{t("refreshing")}</span>
        </output>
      )}

      {/* Two-column layout with space-between (word | definitions) */}
      {!query.isPending && (
        <div className="grid">
          <WordListHeader
            total={total}
            totalDefs={totalDefs}
            sortField={filters.sortField}
            sortDir={filters.sortDir}
            defSortDir={filters.defSortDir}
            onToggleWordSort={toggleWordSort}
            onToggleDefSort={toggleDefSort}
            onOpenNewWord={() => setOpenNewWord(true)}
          />
          <ul>
            {items.map((w) => (
              <WordRow
                key={w.id}
                word={w}
                onEditWordStart={(current) => startEditWord(w.id, current)}
                onEditDefStart={(defId, current, difficulty, endDate) =>
                  startEditDef(defId, current, difficulty ?? null, endDate ?? null)
                }
                onRequestDeleteWord={() => setConfirm({ type: "word", id: w.id, text: w.word_text })}
                onRequestDeleteDef={(defId, text) => setConfirm({ type: "def", id: defId, text })}
                isAddDefinitionOpen={openForWord === w.id}
                onAddDefinitionOpenChange={(v) => setOpenForWord(v ? w.id : null)}
                openTagsForDefId={openTagsForDef}
                onDefTagsOpenChange={(defId, open) => setOpenTagsForDef(open ? defId : null)}
                onDefTagsSaved={() => query.refetch({ cancelRefetch: true })}
              />
            ))}
          </ul>
        </div>
      )}

      <LoadMoreButton
        hasNext={!!query.hasNextPage}
        isLoading={!!query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      />
      <NewWordModal open={openNewWord} onOpenChange={setOpenNewWord} />
      <EditWordModal
        open={!!editWord}
        onOpenChange={(v) => !v && setEditWord(null)}
        wordId={editWord?.id ?? ""}
        initialValue={editWord?.text ?? ""}
        onSaved={async () => {
          incrementPending({ words: 1, descriptions: 0 });
          toast.success(t("wordChangeQueued"));
          await query.refetch({ cancelRefetch: true });
        }}
      />
      <EditDefinitionModal
        open={!!editDef}
        onOpenChange={(v) => !v && setEditDef(null)}
        defId={editDef?.id ?? ""}
        initialValue={editDef?.text ?? ""}
        initialDifficulty={editDef?.difficulty ?? null}
        initialEndDate={editDef?.endDate ?? null}
        onSaved={async ({ pendingCreated }) => {
          if (pendingCreated) {
            incrementPending({ words: 1, descriptions: 1 });
            toast.success(t("definitionChangeQueued"));
          } else {
            toast.success(t("definitionUpdated"));
          }
          await query.refetch({ cancelRefetch: true });
        }}
      />
      <ConfirmDeleteDialog
        open={!!confirm}
        type={confirm?.type}
        onOpenChange={(v) => !v && setConfirm(null)}
        onConfirm={confirmDelete}
        deleting={deleting}
      />
    </div>
  );
}
