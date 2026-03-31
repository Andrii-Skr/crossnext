"use client";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { ExpiredDefinitionItem } from "@/components/admin/ExpiredDefinitionItem";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { Button } from "@/components/ui/button";
import { EndDateSelect } from "@/components/ui/end-date-select";
import { Input } from "@/components/ui/input";

type Item = { id: string; word: string; text: string; difficulty: number; endDateIso?: string | null };
const DEFAULT_BATCH_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type ExpiredApiResponse = {
  items?: unknown;
  hasMore?: boolean;
  total?: unknown;
};

function normalizeItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<Item>;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  const difficulty = Number.isFinite(value.difficulty as number) ? Number(value.difficulty) : 1;
  return {
    id: value.id,
    word: typeof value.word === "string" ? value.word : "",
    text: typeof value.text === "string" ? value.text : "",
    difficulty,
    endDateIso: typeof value.endDateIso === "string" || value.endDateIso === null ? value.endDateIso : null,
  };
}

function mergeItemsById(current: Item[], incoming: Item[]): Item[] {
  if (incoming.length === 0) return current;
  const map = new Map<string, Item>(current.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
}

export function ExpiredDefinitionsClient({
  items,
  difficulties = [],
  nowIso,
  langCode,
  initialHasMore = false,
  initialTotalCount = 0,
  batchSize = DEFAULT_BATCH_SIZE,
  extendAction,
  softDeleteAction,
  extendActionBulk,
}: {
  items: Item[];
  difficulties?: number[];
  nowIso?: string;
  langCode: string;
  initialHasMore?: boolean;
  initialTotalCount?: number;
  batchSize?: number;
  extendAction: (formData: FormData) => Promise<void>;
  softDeleteAction: (formData: FormData) => Promise<void>;
  extendActionBulk: (formData: FormData) => Promise<void>;
}) {
  const f = useFormatter();
  const t = useTranslations();
  const [loadedItems, setLoadedItems] = useState<Item[]>(items);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [filteredTotal, setFilteredTotal] = useState(initialTotalCount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [selectAllAcrossFilter, setSelectAllAcrossFilter] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearchValue, setDebouncedSearchValue] = useState("");
  const baseNow = nowIso ? new Date(nowIso) : null;
  const [endDate, setEndDate] = useState<Date | null>(null);

  const bulkFormId = "bulk-extend-form";
  const idsJoined = useMemo(() => Array.from(selectedIds).join(","), [selectedIds]);
  const excludeIdsJoined = useMemo(() => Array.from(excludedIds).join(","), [excludedIds]);
  const difficultyOptions = difficulties;
  const resetSelection = useCallback(() => {
    setSelectedIds(new Set());
    setExcludedIds(new Set());
    setSelectAllAcrossFilter(false);
  }, []);

  useEffect(() => {
    setLoadedItems(items);
    setHasMore(initialHasMore);
    setFilteredTotal(initialTotalCount);
    resetSelection();
    setSearchValue("");
    setDebouncedSearchValue("");
  }, [initialHasMore, initialTotalCount, items, resetSelection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchValue(searchValue.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  const fetchBatch = useCallback(
    async (offset: number, query: string) => {
      const params = new URLSearchParams();
      params.set("lang", langCode);
      params.set("offset", String(offset));
      params.set("take", String(batchSize));
      if (nowIso) params.set("now", nowIso);
      if (query) params.set("q", query);

      const res = await fetch(`/api/admin/expired?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await res.json()) as ExpiredApiResponse;
      if (!res.ok) {
        return { items: [] as Item[], hasMore: false, total: 0 };
      }
      const nextRaw = Array.isArray(data.items) ? data.items : [];
      const nextItems = nextRaw.map((item) => normalizeItem(item)).filter((item): item is Item => Boolean(item));
      const totalRaw = typeof data.total === "number" ? data.total : Number.NaN;
      const total = Number.isFinite(totalRaw) ? totalRaw : undefined;
      return { items: nextItems, hasMore: Boolean(data.hasMore), total };
    },
    [batchSize, langCode, nowIso],
  );

  useEffect(() => {
    if (!debouncedSearchValue) {
      setLoadedItems(items);
      setHasMore(initialHasMore);
      setFilteredTotal(initialTotalCount);
      resetSelection();
      return;
    }
    let cancelled = false;
    setIsLoadingMore(true);
    resetSelection();
    void fetchBatch(0, debouncedSearchValue)
      .then((next) => {
        if (cancelled) return;
        setLoadedItems(next.items);
        setHasMore(next.hasMore);
        setFilteredTotal(typeof next.total === "number" ? next.total : next.items.length);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadedItems([]);
        setHasMore(false);
        setFilteredTotal(0);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingMore(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearchValue, fetchBatch, initialHasMore, initialTotalCount, items, resetSelection]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const next = await fetchBatch(loadedItems.length, debouncedSearchValue);
      setLoadedItems((prev) => mergeItemsById(prev, next.items));
      setHasMore(next.hasMore);
      if (typeof next.total === "number") {
        setFilteredTotal(next.total);
      }
    } catch {
      // Keep existing list and allow retry on the next scroll/button press.
    } finally {
      setIsLoadingMore(false);
    }
  }, [debouncedSearchValue, fetchBatch, hasMore, isLoadingMore, loadedItems.length]);
  const isItemChecked = useCallback(
    (id: string) => (selectAllAcrossFilter ? !excludedIds.has(id) : selectedIds.has(id)),
    [excludedIds, selectAllAcrossFilter, selectedIds],
  );
  const checkedVisibleCount = useMemo(
    () => loadedItems.reduce((acc, item) => (isItemChecked(item.id) ? acc + 1 : acc), 0),
    [isItemChecked, loadedItems],
  );
  const allVisibleChecked = loadedItems.length > 0 && checkedVisibleCount === loadedItems.length;
  const selectedCount = useMemo(
    () => (selectAllAcrossFilter ? Math.max(filteredTotal - excludedIds.size, 0) : selectedIds.size),
    [excludedIds.size, filteredTotal, selectAllAcrossFilter, selectedIds.size],
  );
  const shouldShowSelectAllBanner = !selectAllAcrossFilter && allVisibleChecked && filteredTotal > loadedItems.length;
  const toggleSelectItem = useCallback(
    (id: string, next: boolean) => {
      if (selectAllAcrossFilter) {
        setExcludedIds((prev) => {
          const updated = new Set(prev);
          if (next) updated.delete(id);
          else updated.add(id);
          return updated;
        });
        return;
      }
      setSelectedIds((prev) => {
        const updated = new Set(prev);
        if (next) updated.add(id);
        else updated.delete(id);
        return updated;
      });
    },
    [selectAllAcrossFilter],
  );
  const selectAllLoaded = useCallback(() => {
    setSelectAllAcrossFilter(false);
    setExcludedIds(new Set());
    setSelectedIds(new Set(loadedItems.map((item) => item.id)));
  }, [loadedItems]);
  const toggleSelectLabel = selectedCount > 0 ? t("clearSelection") : t("selectAll");
  const toggleSelectAll = useCallback(() => {
    if (selectedCount > 0 || selectAllAcrossFilter) {
      resetSelection();
      return;
    }
    selectAllLoaded();
  }, [resetSelection, selectAllAcrossFilter, selectAllLoaded, selectedCount]);
  const selectAllAcrossCurrentFilter = useCallback(() => {
    setSelectedIds(new Set());
    setExcludedIds(new Set());
    setSelectAllAcrossFilter(true);
  }, []);

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <div className="grid gap-1 w-full sm:w-80">
          <span className="text-sm text-muted-foreground">{t("word")}</span>
          <Input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
          />
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
          <div className="flex items-center gap-2">
            <Button variant="outline" type="button" onClick={toggleSelectAll} disabled={loadedItems.length === 0}>
              {toggleSelectLabel}
            </Button>
            <span className="text-xs text-muted-foreground">{selectedCount}</span>
          </div>
          <div className="hidden lg:block h-8 w-px bg-border self-end" aria-hidden />
          <div className="grid gap-1 w-full sm:w-44">
            <span className="text-sm text-muted-foreground">{t("endDate")}</span>
            <EndDateSelect
              value={endDate}
              onChange={setEndDate}
              baseNow={baseNow}
              name="end_date"
              form={bulkFormId}
              triggerClassName="w-full sm:w-42 lg:w-42"
            />
          </div>
          <ServerActionSubmit
            action={extendActionBulk}
            labelKey="save"
            successKey="definitionUpdated"
            size="sm"
            className="h-9 w-full sm:w-auto"
            formId={bulkFormId}
          />
          <form id={bulkFormId} className="hidden">
            <input type="hidden" name="ids" value={selectAllAcrossFilter ? "" : idsJoined} readOnly />
            <input type="hidden" name="selectAllAcrossFilter" value={selectAllAcrossFilter ? "1" : "0"} readOnly />
            <input type="hidden" name="lang" value={langCode} readOnly />
            <input type="hidden" name="q" value={debouncedSearchValue} readOnly />
            <input type="hidden" name="excludeIds" value={selectAllAcrossFilter ? excludeIdsJoined : ""} readOnly />
          </form>
        </div>
        {(shouldShowSelectAllBanner || selectAllAcrossFilter) && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
            {!selectAllAcrossFilter ? (
              <>
                <p>{t("expiredSelectionPage", { count: f.number(checkedVisibleCount) })}</p>
                <p>{t("expiredSelectionInviteAll", { total: f.number(filteredTotal) })}</p>
                <Button variant="secondary" size="sm" type="button" onClick={selectAllAcrossCurrentFilter}>
                  {t("bulkSelectAllFiltered", { count: f.number(filteredTotal) })}
                </Button>
              </>
            ) : (
              <>
                <p>
                  {t(excludedIds.size > 0 ? "expiredSelectionAllExcept" : "expiredSelectionAll", {
                    total: f.number(filteredTotal),
                    excluded: f.number(excludedIds.size),
                  })}
                </p>
                <p>{t("expiredSelectionUncheckHint")}</p>
                <Button variant="outline" size="sm" type="button" onClick={resetSelection}>
                  {t("clearSelection")}
                </Button>
              </>
            )}
          </div>
        )}
        <div className="h-px w-full bg-border" />
      </div>
      <div className="rounded-md border">
        {loadedItems.length === 0 && !isLoadingMore ? (
          <div className="p-4 text-sm text-muted-foreground">{t("noData")}</div>
        ) : (
          <Virtuoso
            data={loadedItems}
            style={{ height: "62dvh" }}
            overscan={400}
            endReached={() => {
              void loadMore();
            }}
            computeItemKey={(_, item) => item.id}
            itemContent={(_, d) => (
              <div className="border-b px-3 last:border-b-0">
                <ExpiredDefinitionItem
                  item={d}
                  nowIso={nowIso}
                  extendAction={extendAction}
                  softDeleteAction={softDeleteAction}
                  difficulties={difficultyOptions}
                  selectable
                  selected={isItemChecked(d.id)}
                  onToggleSelect={toggleSelectItem}
                />
              </div>
            )}
            components={{
              Footer: () => (
                <div className="flex justify-center p-3">
                  {isLoadingMore ? (
                    <span className="text-sm text-muted-foreground">{t("loading")}</span>
                  ) : hasMore ? (
                    <Button variant="outline" size="sm" onClick={() => void loadMore()}>
                      {t("loadMore")}
                    </Button>
                  ) : null}
                </div>
              ),
            }}
          />
        )}
      </div>
    </div>
  );
}
