"use client";

import { ChevronDown, ChevronRight, Layers, Merge, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type AdminTagDefinition = { id: string; word: string; text: string };
type AdminTagItem = { id: number; name: string; count: number; definitions: AdminTagDefinition[] };
type AdminTagOption = { id: number; name: string };
type Action = (formData: FormData) => Promise<void>;
type RemoveAction = (formData: FormData) => Promise<void>;
type BulkAddAction = (formData: FormData) => Promise<void>;
type DeleteEmptyAction = (formData: FormData) => Promise<void>;

export function TagsAdminClient({
  items,
  allTags,
  initialFilter = "",
  mergeAction,
  deleteAction,
  removeDefinitionAction,
  addTagToTagsAction,
  deleteEmptyTagsAction,
  emptyTagsCount,
}: {
  items: AdminTagItem[];
  allTags: AdminTagOption[];
  initialFilter?: string;
  mergeAction: Action;
  deleteAction: Action;
  removeDefinitionAction: RemoveAction;
  addTagToTagsAction: BulkAddAction;
  deleteEmptyTagsAction: DeleteEmptyAction;
  emptyTagsCount: number;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [query, setQuery] = useState(initialFilter);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [mergeFor, setMergeFor] = useState<AdminTagItem | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [deleteFor, setDeleteFor] = useState<AdminTagItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkSelectedTags, setBulkSelectedTags] = useState<Set<number>>(new Set());
  const [bulkTarget, setBulkTarget] = useState("");
  const [applyingBulkTag, setApplyingBulkTag] = useState(false);
  const [removingEmpty, setRemovingEmpty] = useState(false);
  const [emptyConfirm, setEmptyConfirm] = useState("");
  const [emptyModalOpen, setEmptyModalOpen] = useState(false);

  useEffect(() => {
    setQuery(initialFilter);
  }, [initialFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  function toggle(id: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const deleteKeyword = t("deleteConfirmKeyword");

  const targetOptions = useMemo(() => allTags.filter((tItem) => tItem.id !== mergeFor?.id), [allTags, mergeFor?.id]);
  const allTagOptions = useMemo(() => allTags, [allTags]);

  function closeMerge() {
    setMergeFor(null);
    setMergeTarget("");
  }

  function closeDelete() {
    setDeleteFor(null);
    setDeleteConfirm("");
  }

  function closeBulkAdd() {
    setBulkAddOpen(false);
    setBulkSelectedTags(new Set());
    setBulkTarget("");
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-80">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("tagFilterPlaceholder")}
              aria-label={t("tagAria")}
              autoComplete="off"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setBulkAddOpen(true)}
                aria-label={t("bulkTagAddTitle")}
              >
                <Layers className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("bulkTagAddTitle")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => setEmptyModalOpen(true)}
                disabled={removingEmpty}
                aria-label={t("deleteEmptyTags")}
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("deleteEmptyTags")}</TooltipContent>
          </Tooltip>
          {emptyTagsCount > 0 ? (
            <Badge variant="secondary" className="ml-1">
              {t("emptyCount", { count: emptyTagsCount })}
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-1">
              {t("emptyCount", { count: 0 })}
            </Badge>
          )}
        </div>

        <div className="divide-y rounded-md border">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">{t("noData")}</div>
          ) : (
            filtered.map((tag) => {
              const isOpen = open.has(tag.id);
              return (
                <div key={tag.id} className="space-y-3 p-3 md:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="flex-1 justify-start px-0 text-left"
                        onClick={() => toggle(tag.id)}
                        aria-expanded={isOpen}
                        aria-controls={`tag-${tag.id}`}
                      >
                        <span className="flex items-center gap-2">
                          {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          <span className="font-medium break-words">{tag.name}</span>
                        </span>
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="mt-1 shrink-0">
                        {t("definitions")}: {tag.count}
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("merge")}
                            onClick={() => {
                              setMergeFor(tag);
                              setMergeTarget(tag.name);
                            }}
                          >
                            <Merge className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("merge")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            aria-label={t("delete")}
                            onClick={() => setDeleteFor(tag)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("delete")}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {isOpen &&
                    (tag.definitions.length ? (
                      <ul id={`tag-${tag.id}`} className="space-y-2">
                        {tag.definitions.map((def) => (
                          <li key={def.id} className="rounded-md border bg-muted/40 p-3">
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="break-words text-sm font-semibold leading-tight">{def.word}</div>
                                <div className="break-words text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                                  {def.text}
                                </div>
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    aria-label={t("removeDefinition")}
                                    onClick={async () => {
                                      const fd = new FormData();
                                      fd.append("tagId", String(tag.id));
                                      fd.append("opredId", def.id);
                                      try {
                                        await removeDefinitionAction(fd);
                                        toast.success(t("tagDefinitionRemoved") as string);
                                        router.refresh();
                                      } catch {
                                        toast.error(t("saveError") as string);
                                      }
                                    }}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("removeDefinition")}</TooltipContent>
                              </Tooltip>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div id={`tag-${tag.id}`} className="pl-6 text-sm text-muted-foreground">
                        {t("noData")}
                      </div>
                    ))}
                </div>
              );
            })
          )}
        </div>

        <Dialog
          open={emptyModalOpen}
          onOpenChange={(next) => (next ? setEmptyModalOpen(true) : setEmptyModalOpen(false))}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("deleteEmptyTagsTitle")}</DialogTitle>
              <DialogDescription>
                {t("deleteEmptyTagsDescription", { keyword: deleteKeyword, count: emptyTagsCount })}
              </DialogDescription>
            </DialogHeader>
            <form
              action={async (formData) => {
                const confirm = String(formData.get("confirm") || "");
                if (confirm.trim().toUpperCase() !== deleteKeyword) {
                  toast.error(t("typeToConfirm", { keyword: deleteKeyword }) as string);
                  return;
                }
                if (emptyTagsCount === 0) {
                  toast.success(t("emptyTagsDeleted") as string);
                  setEmptyModalOpen(false);
                  setEmptyConfirm("");
                  return;
                }
                setRemovingEmpty(true);
                try {
                  await deleteEmptyTagsAction(formData);
                  toast.success(t("emptyTagsDeleted") as string);
                  setEmptyModalOpen(false);
                  setEmptyConfirm("");
                  router.refresh();
                } catch {
                  toast.error(t("saveError") as string);
                } finally {
                  setRemovingEmpty(false);
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="empty-confirm">{t("typeToConfirm", { keyword: deleteKeyword })}</Label>
                <Input
                  id="empty-confirm"
                  name="confirm"
                  value={emptyConfirm}
                  onChange={(e) => setEmptyConfirm(e.target.value)}
                  autoComplete="off"
                  placeholder={deleteKeyword}
                />
              </div>
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEmptyModalOpen(false)}
                  disabled={removingEmpty}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={removingEmpty || emptyConfirm.trim().toUpperCase() !== deleteKeyword}
                >
                  {t("delete")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={bulkAddOpen} onOpenChange={(next) => (next ? setBulkAddOpen(true) : closeBulkAdd())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("bulkTagAddTitle")}</DialogTitle>
              <DialogDescription>{t("bulkTagAddDescription")}</DialogDescription>
            </DialogHeader>
            <form
              action={async (formData) => {
                const ids = String(formData.get("ids") || "");
                const target = String(formData.get("targetName") || "").trim();
                if (!ids || !target) {
                  toast.error(t("fillRequired") as string);
                  return;
                }
                setApplyingBulkTag(true);
                try {
                  await addTagToTagsAction(formData);
                  toast.success(t("tagAddedToDefinitions") as string);
                  closeBulkAdd();
                  router.refresh();
                } catch {
                  toast.error(t("saveError") as string);
                } finally {
                  setApplyingBulkTag(false);
                }
              }}
            >
              <input type="hidden" name="ids" value={Array.from(bulkSelectedTags).join(",")} />
              <input type="hidden" name="targetName" value={bulkTarget} />
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t("selectTags")}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setBulkSelectedTags(new Set(items.map((i) => i.id)))}
                    >
                      {t("selectAll")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBulkSelectedTags(new Set())}>
                      {t("clearSelection")}
                    </Button>
                  </div>
                </div>
                <div className="max-h-64 space-y-2 overflow-auto rounded border p-2">
                  {items.map((tag) => (
                    <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={bulkSelectedTags.has(tag.id)}
                        onChange={(e) => {
                          setBulkSelectedTags((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(tag.id);
                            else next.delete(tag.id);
                            return next;
                          });
                        }}
                      />
                      <span className="break-words">{tag.name}</span>
                      <span className="text-xs text-muted-foreground">({tag.count})</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bulk-target">{t("mergeTargetLabel")}</Label>
                  <Input
                    id="bulk-target"
                    value={bulkTarget}
                    onChange={(e) => setBulkTarget(e.target.value)}
                    list="all-tags"
                    autoComplete="off"
                    placeholder={t("tagAria")}
                    required
                  />
                  <datalist id="all-tags">
                    {allTagOptions.map((opt) => (
                      <option key={opt.id} value={opt.name} />
                    ))}
                  </datalist>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={closeBulkAdd}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={applyingBulkTag || bulkSelectedTags.size === 0 || !bulkTarget.trim()}>
                  {t("bulkTagAddSubmit")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(mergeFor)} onOpenChange={(next) => (next ? null : closeMerge())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("mergeTagTitle")}</DialogTitle>
              <DialogDescription>
                {mergeFor ? t("mergeTagDescription", { from: mergeFor.name }) : null}
              </DialogDescription>
            </DialogHeader>
            <form
              action={async (formData) => {
                try {
                  await mergeAction(formData);
                  toast.success(t("tagsMerged") as string);
                  closeMerge();
                  router.refresh();
                } catch {
                  toast.error(t("saveError") as string);
                }
              }}
            >
              <input type="hidden" name="sourceId" value={mergeFor?.id ?? ""} />
              <div className="space-y-2">
                <Label htmlFor="merge-target">{t("mergeTargetLabel")}</Label>
                <Input
                  id="merge-target"
                  name="targetName"
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  list="merge-tags"
                  autoComplete="off"
                  required
                />
                <datalist id="merge-tags">
                  {targetOptions.map((opt) => (
                    <option key={opt.id} value={opt.name} />
                  ))}
                </datalist>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={closeMerge}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={!mergeTarget.trim()}>
                  {t("merge")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(deleteFor)} onOpenChange={(next) => (next ? null : closeDelete())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("deleteTagTitle")}</DialogTitle>
              <DialogDescription>
                {deleteFor ? t("deleteTagDescription", { keyword: deleteKeyword, name: deleteFor.name }) : null}
              </DialogDescription>
            </DialogHeader>
            <form
              action={async (formData) => {
                try {
                  await deleteAction(formData);
                  toast.success(t("tagDeleted") as string);
                  closeDelete();
                  router.refresh();
                } catch {
                  toast.error(t("saveError") as string);
                }
              }}
            >
              <input type="hidden" name="id" value={deleteFor?.id ?? ""} />
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">{t("typeToConfirm", { keyword: deleteKeyword })}</Label>
                <Input
                  id="delete-confirm"
                  name="confirm"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  autoComplete="off"
                  placeholder={deleteKeyword}
                />
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={closeDelete}>
                  {t("cancel")}
                </Button>
                <Button type="submit" variant="destructive" disabled={deleteConfirm.trim() !== deleteKeyword}>
                  {t("delete")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
