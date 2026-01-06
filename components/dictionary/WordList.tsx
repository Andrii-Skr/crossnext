"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EditDefinitionModal } from "@/components/dictionary/EditDefinitionModal";
import { EditWordModal } from "@/components/dictionary/EditWordModal";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/fetcher";
import { canAdminTags } from "@/lib/roles";
import { type DictionaryFilters, useDictionaryStore } from "@/store/dictionary";
import { usePendingStore } from "@/store/pending";
import type { BulkTagPayload, DictionaryFilterInput } from "@/types/dictionary-bulk";
import { Filters, type FiltersValue, type TagOption } from "./Filters";
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
  const f = useFormatter();
  const { data: session } = useSession();
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
  const [bulkTagging, setBulkTagging] = useState(false);
  const [bulkTags, setBulkTags] = useState<TagOption[]>([]);
  const [selectedDefIds, setSelectedDefIds] = useState<Set<string>>(new Set());
  const [excludedDefIds, setExcludedDefIds] = useState<Set<string>>(new Set());
  const [selectAllAcrossFilter, setSelectAllAcrossFilter] = useState(false);
  const [applyingTags, setApplyingTags] = useState(false);
  const role = (session?.user as { role?: string | null } | undefined)?.role ?? null;
  const canUseBulkTags = canAdminTags(role);
  const key = useMemo(
    () => ["dictionary", filters, dictLang, bulkTagging ? "bulk-tags" : "default"] as const,
    [filters, dictLang, bulkTagging],
  );
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => {
      const lenDirParam = filters.lenDir ?? "";
      const lenFieldParam = filters.lenFilterField ?? (filters.lenDir ? "word" : "");
      const sortFieldParam = filters.sortField ?? "";
      const sortDirParam = filters.sortDir ?? "";
      const defSortDirParam = filters.defSortDir ?? "";
      const tagFilters = bulkTagging ? [] : (filters.tags ?? []);
      const tagsParams = tagFilters.map((n) => `&tags=${encodeURIComponent(n)}`).join("");
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
  const visibleDefIds = useMemo(() => items.flatMap((w) => w.opred_v.map((d) => d.id)), [items]);
  const total = query.data?.pages[0]?.total ?? 0;
  const totalDefs = query.data?.pages[0]?.totalDefs ?? 0;

  const resetBulkSelection = useCallback(() => {
    setSelectedDefIds(new Set());
    setExcludedDefIds(new Set());
    setSelectAllAcrossFilter(false);
  }, []);

  const isDefChecked = useCallback(
    (id: string) => (selectAllAcrossFilter ? !excludedDefIds.has(id) : selectedDefIds.has(id)),
    [selectAllAcrossFilter, excludedDefIds, selectedDefIds],
  );
  const checkedVisibleCount = useMemo(
    () => visibleDefIds.reduce((acc, id) => (isDefChecked(id) ? acc + 1 : acc), 0),
    [visibleDefIds, isDefChecked],
  );
  const allVisibleChecked = visibleDefIds.length > 0 && checkedVisibleCount === visibleDefIds.length;
  const someVisibleChecked = checkedVisibleCount > 0 && !allVisibleChecked;
  const totalSelectedForBulk = useMemo(
    () => (selectAllAcrossFilter ? Math.max(totalDefs - excludedDefIds.size, 0) : selectedDefIds.size),
    [selectAllAcrossFilter, totalDefs, excludedDefIds.size, selectedDefIds.size],
  );
  const shouldShowSelectAllBanner = !selectAllAcrossFilter && allVisibleChecked && totalDefs > visibleDefIds.length;
  const selectionResetKey = useMemo(() => JSON.stringify({ filters, dictLang }), [filters, dictLang]);

  useEffect(() => {
    if (!canUseBulkTags && bulkTagging) {
      setBulkTagging(false);
      resetBulkSelection();
      setBulkTags([]);
    }
  }, [canUseBulkTags, bulkTagging, resetBulkSelection]);

  useEffect(() => {
    void selectionResetKey;
    if (!bulkTagging) return;
    resetBulkSelection();
  }, [bulkTagging, resetBulkSelection, selectionResetKey]);

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

  const toggleSelectDef = useCallback(
    (defId: string, next: boolean) => {
      if (selectAllAcrossFilter) {
        setExcludedDefIds((prev) => {
          const updated = new Set(prev);
          if (next) updated.delete(defId);
          else updated.add(defId);
          return updated;
        });
        return;
      }
      setSelectedDefIds((prev) => {
        const updated = new Set(prev);
        if (next) updated.add(defId);
        else updated.delete(defId);
        return updated;
      });
    },
    [selectAllAcrossFilter],
  );

  const toggleSelectAllVisible = useCallback(() => {
    if (selectAllAcrossFilter) {
      resetBulkSelection();
      return;
    }
    if (allVisibleChecked) {
      resetBulkSelection();
      return;
    }
    if (!visibleDefIds.length) return;
    setSelectedDefIds(new Set(visibleDefIds));
    setExcludedDefIds(new Set());
    setSelectAllAcrossFilter(false);
  }, [allVisibleChecked, resetBulkSelection, selectAllAcrossFilter, visibleDefIds]);

  function selectAllAcrossCurrentFilter() {
    setSelectedDefIds(new Set());
    setExcludedDefIds(new Set());
    setSelectAllAcrossFilter(true);
  }

  const buildFilterSnapshot = useCallback(
    (): DictionaryFilterInput => ({
      language: dictLang,
      query: filters.q,
      scope: filters.scope,
      tagNames: bulkTagging ? [] : (filters.tags ?? []),
      searchMode: filters.searchMode,
      lenFilterField: filters.lenFilterField,
      lenMin: filters.lenMin,
      lenMax: filters.lenMax,
      difficultyMin: filters.difficultyMin,
      difficultyMax: filters.difficultyMax,
    }),
    [bulkTagging, dictLang, filters],
  );

  async function applyTagsToSelected() {
    if (!bulkTagging || !bulkTags.length || totalSelectedForBulk === 0) return;
    try {
      setApplyingTags(true);
      const tagIds = Array.from(new Set(bulkTags.map((t) => t.id)));
      const payload: BulkTagPayload = selectAllAcrossFilter
        ? {
            action: "applyTags",
            tagIds,
            selectAllAcrossFilter: true,
            filter: buildFilterSnapshot(),
            excludeIds: Array.from(excludedDefIds),
          }
        : {
            action: "applyTags",
            tagIds,
            ids: Array.from(selectedDefIds),
          };

      const res = await fetcher<{ applied: number }>("/api/dictionary/bulk-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const appliedCount = res?.applied ?? totalSelectedForBulk;
      toast.success(t("tagsAppliedCount", { count: f.number(appliedCount) }));
      resetBulkSelection();
      setBulkTags([]);
      await query.refetch({ cancelRefetch: true });
    } catch (err: unknown) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 403) toast.error(t("forbidden"));
      else toast.error(t("saveError"));
    } finally {
      setApplyingTags(false);
    }
  }

  const showContent = !query.isPending;

  return (
    <>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,340px),1fr]">
        <div className="z-20 space-y-4 lg:sticky lg:top-[-15] lg:self-start lg:max-h-[calc(100vh-1rem)] lg:overflow-auto lg:pt-4">
          <Filters
            value={filters as unknown as FiltersValue}
            onChange={(v) => setFilters(v as Partial<DictionaryFilters>)}
            onReset={() => resetFilters()}
            bulkMode={bulkTagging}
            bulkTags={bulkTags}
            onBulkTagsChange={setBulkTags}
            onToggleBulkMode={
              canUseBulkTags
                ? (next) => {
                    setBulkTagging(next);
                    if (!next) {
                      setSelectedDefIds(new Set());
                      setExcludedDefIds(new Set());
                      setSelectAllAcrossFilter(false);
                      setBulkTags([]);
                    }
                  }
                : undefined
            }
            onApplyBulkTags={applyTagsToSelected}
            bulkApplyDisabled={!bulkTags.length || totalSelectedForBulk === 0 || applyingTags}
            bulkApplyPending={applyingTags}
            canUseBulkTags={canUseBulkTags}
          />
        </div>

        <div className="grid gap-4">
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

          {/* Контент справа отдельно от левого столбца фильтров */}
          {showContent && (
            <>
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
                  bulkMode={bulkTagging}
                  allSelected={allVisibleChecked}
                  someSelected={someVisibleChecked}
                  onToggleSelectAll={toggleSelectAllVisible}
                />
                {bulkTagging && (shouldShowSelectAllBanner || selectAllAcrossFilter) && (
                  <div className="flex flex-col gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      {!selectAllAcrossFilter ? (
                        <>
                          <p className="font-medium text-foreground">
                            {t("bulkSelectionPage", { count: f.number(checkedVisibleCount) })}
                          </p>
                          <p>{t("bulkSelectionInviteAll", { total: f.number(totalDefs) })}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-foreground">
                            {t(excludedDefIds.size > 0 ? "bulkSelectionAllExcept" : "bulkSelectionAll", {
                              total: f.number(totalDefs),
                              excluded: f.number(excludedDefIds.size),
                            })}
                          </p>
                          <p>{t(excludedDefIds.size > 0 ? "bulkSelectionExcludedHint" : "bulkSelectionUncheckHint")}</p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!selectAllAcrossFilter ? (
                        <>
                          <Button variant="secondary" size="sm" onClick={selectAllAcrossCurrentFilter}>
                            {t("bulkSelectAllFiltered", { count: f.number(totalDefs) })}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={resetBulkSelection}>
                            {t("clearSelection")}
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={resetBulkSelection}>
                          {t("clearSelection")}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
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
                      bulkMode={bulkTagging}
                      isRowChecked={isDefChecked}
                      onToggleSelectDef={toggleSelectDef}
                    />
                  ))}
                </ul>
              </div>

              {total > 0 && totalDefs > 0 && (
                <LoadMoreButton
                  hasNext={!!query.hasNextPage}
                  isLoading={!!query.isFetchingNextPage}
                  onClick={() => query.fetchNextPage()}
                />
              )}
            </>
          )}
        </div>
      </div>

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
    </>
  );
}
