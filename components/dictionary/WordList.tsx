"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
import { useDictionaryStore } from "@/store/dictionary";
import { Filters, type FiltersValue } from "./Filters";
import { NewWordModal } from "./NewWordModal";
import type { Word } from "./WordItem";
import { ConfirmDeleteDialog } from "./word-list/ConfirmDeleteDialog";
import { LoadMoreButton } from "./word-list/LoadMoreButton";
import { WordListHeader } from "./word-list/WordListHeader";
import { type EditingState, WordRow } from "./word-list/WordRow";

type Page = {
  items: Word[];
  nextCursor: string | null;
  total: number;
  totalDefs: number;
};

export function WordList() {
  const t = useTranslations();
  type FiltersValueEx = FiltersValue & {
    lenFilterField?: "word" | "def";
    lenMin?: number;
    lenMax?: number;
    // Sorting
    sortField?: "word"; // only words sorting here
    sortDir?: "asc" | "desc";
    defSortDir?: "asc" | "desc"; // sort definitions within each word
  };
  const [filters, setFilters] = useState<FiltersValueEx>({
    q: "",
    scope: "word",
    searchMode: "contains",
    // length sort: default None
    lenDir: undefined,
  });
  const [editing, setEditing] = useState<EditingState>(null);
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
      const sortFieldParam = filters.sortField ?? "";
      const sortDirParam = filters.sortDir ?? "";
      const defSortDirParam = filters.defSortDir ?? "";
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
          `&sortField=${sortFieldParam}` +
          `&sortDir=${sortDirParam}` +
          `&defSortDir=${defSortDirParam}` +
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

  function toggleWordSort() {
    setFilters((prev) => {
      const nextDir: "asc" | "desc" =
        prev.sortField === "word" && prev.sortDir === "asc" ? "desc" : "asc";
      return { ...prev, sortField: "word", sortDir: nextDir };
    });
  }

  function toggleDefSort() {
    setFilters((prev) => {
      const nextDir: "asc" | "desc" =
        prev.defSortDir === "asc" ? "desc" : "asc";
      return { ...prev, defSortDir: nextDir };
    });
  }

  return (
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
                  editing={editing}
                  editValue={editValue}
                  saving={saving}
                  onEditWordStart={(current) => startEditWord(w.id, current)}
                  onEditDefStart={(defId, current) => startEditDef(defId, current)}
                  onEditChange={setEditValue}
                  onEditSave={saveEdit}
                  onEditCancel={cancelEdit}
                  onRequestDeleteWord={() =>
                    setConfirm({ type: "word", id: w.id, text: w.word_text })
                  }
                  onRequestDeleteDef={(defId, text) =>
                    setConfirm({ type: "def", id: defId, text })
                  }
                  isAddDefinitionOpen={openForWord === w.id}
                  onAddDefinitionOpenChange={(v) =>
                    setOpenForWord(v ? w.id : null)
                  }
                  openTagsForDefId={openTagsForDef}
                  onDefTagsOpenChange={(defId, open) =>
                    setOpenTagsForDef(open ? defId : null)
                  }
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
