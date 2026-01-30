"use client";

import { ChevronRight, CirclePlus, CircleQuestionMark } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ContextTarget, Edition, Issue } from "./types";

export function ScanwordsLists({
  editions,
  selectedEdition,
  selectedIssue,
  selectedEditionId,
  selectedIssueId,
  onSelectEdition,
  onSelectIssue,
  onOpenEditionDialog,
  onOpenIssueDialog,
  onToggleHidden,
  onRequestDelete,
  children,
}: {
  editions: Edition[];
  selectedEdition: Edition | null;
  selectedIssue: Issue | null;
  selectedEditionId: number | null;
  selectedIssueId: string | null;
  onSelectEdition: (editionId: number | null) => void;
  onSelectIssue: (issueId: string, templateId: number | null) => void;
  onOpenEditionDialog: () => void;
  onOpenIssueDialog: () => void;
  onToggleHidden: (target: ContextTarget) => void;
  onRequestDelete: (target: ContextTarget) => void;
  children?: ReactNode;
}) {
  const t = useTranslations();
  const [showHiddenEditions, setShowHiddenEditions] = useState(false);
  const [showHiddenIssues, setShowHiddenIssues] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextTarget;
  } | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(null);
  const [menuMounted, setMenuMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const issuesPanelRef = useRef<HTMLDivElement | null>(null);
  const issuesCardRef = useRef<HTMLDivElement | null>(null);
  const workspacePanelRef = useRef<HTMLDivElement | null>(null);
  const workspaceCardRef = useRef<HTMLDivElement | null>(null);
  const editionButtonRefs = useRef(new Map<number, HTMLButtonElement | null>());
  const issueButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const [issuesOffset, setIssuesOffset] = useState(0);
  const [workspaceOffset, setWorkspaceOffset] = useState(0);

  const visibleEditions = editions.filter((edition) => !edition.hidden);
  const hiddenEditions = editions.filter((edition) => edition.hidden);
  const issues = selectedEdition?.issues ?? [];
  const visibleIssues = issues.filter((issue) => !issue.hidden);
  const hiddenIssues = issues.filter((issue) => issue.hidden);

  useEffect(() => {
    setMenuMounted(true);
  }, []);

  useEffect(() => {
    if (selectedEditionId === null) {
      setShowHiddenIssues(false);
      return;
    }
    setShowHiddenIssues(false);
  }, [selectedEditionId]);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      setContextMenu(null);
      setMenuStyle(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setMenuStyle(null);
      }
    };
    const handleScroll = () => {
      setContextMenu(null);
      setMenuStyle(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || menuStyle || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const padding = 8;
    const left = Math.min(contextMenu.x, window.innerWidth - rect.width - padding);
    const top = Math.min(contextMenu.y, window.innerHeight - rect.height - padding);
    setMenuStyle({
      left: Math.max(padding, left),
      top: Math.max(padding, top),
    });
  }, [contextMenu, menuStyle]);

  const openContextMenu = (event: ReactMouseEvent, target: ContextTarget) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, target });
    setMenuStyle(null);
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    setMenuStyle(null);
  };

  const handleContextToggleHidden = () => {
    if (!contextMenu) return;
    const { target } = contextMenu;
    closeContextMenu();
    onToggleHidden(target);
  };

  const handleContextDelete = () => {
    if (!contextMenu) return;
    const { target } = contextMenu;
    closeContextMenu();
    onRequestDelete(target);
  };

  const handleSelectEdition = (editionId: number | null) => {
    onSelectEdition(editionId);
    setShowHiddenIssues(false);
  };

  const setEditionButtonRef = useCallback(
    (editionId: number) => (node: HTMLButtonElement | null) => {
      if (node) {
        editionButtonRefs.current.set(editionId, node);
      } else {
        editionButtonRefs.current.delete(editionId);
      }
    },
    [],
  );

  const setIssueButtonRef = useCallback(
    (issueId: string) => (node: HTMLButtonElement | null) => {
      if (node) {
        issueButtonRefs.current.set(issueId, node);
      } else {
        issueButtonRefs.current.delete(issueId);
      }
    },
    [],
  );

  const updateIssuesOffset = useCallback(() => {
    if (selectedEditionId == null) {
      setIssuesOffset(0);
      return;
    }
    const button = editionButtonRefs.current.get(selectedEditionId);
    const panel = issuesPanelRef.current;
    const card = issuesCardRef.current;
    if (!button || !panel || !card) {
      setIssuesOffset(0);
      return;
    }
    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const cardHeight = card.getBoundingClientRect().height;
    const padding = 28;
    const desiredOffset = buttonRect.top - panelRect.top;
    const minOffset = padding - panelRect.top;
    const maxOffset = window.innerHeight - padding - cardHeight - panelRect.top;
    let nextOffset = desiredOffset;
    if (minOffset <= maxOffset) {
      nextOffset = Math.min(Math.max(desiredOffset, minOffset), maxOffset);
    } else {
      nextOffset = minOffset;
    }
    setIssuesOffset(nextOffset);
  }, [selectedEditionId]);

  const updateWorkspaceOffset = useCallback(() => {
    if (selectedIssueId == null) {
      setWorkspaceOffset(0);
      return;
    }
    const button = issueButtonRefs.current.get(selectedIssueId);
    const panel = workspacePanelRef.current;
    const card = workspaceCardRef.current;
    if (!button || !panel || !card) {
      setWorkspaceOffset(0);
      return;
    }
    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const cardHeight = card.getBoundingClientRect().height;
    const padding = 28;
    const desiredOffset = buttonRect.top - panelRect.top;
    const minOffset = padding - panelRect.top;
    const maxOffset = window.innerHeight - padding - cardHeight - panelRect.top;
    let nextOffset = desiredOffset;
    if (minOffset <= maxOffset) {
      nextOffset = Math.min(Math.max(desiredOffset, minOffset), maxOffset);
    } else {
      nextOffset = minOffset;
    }
    setWorkspaceOffset(nextOffset);
  }, [selectedIssueId]);

  const listSignature = `${visibleIssues.length}:${hiddenIssues.length}:${showHiddenIssues ? 1 : 0}`;
  const workspaceSignature = `${listSignature}:${selectedIssueId ?? "none"}`;

  useLayoutEffect(() => {
    if (listSignature.length === 0) return;
    updateIssuesOffset();
  }, [listSignature, updateIssuesOffset]);

  useLayoutEffect(() => {
    if (workspaceSignature.length === 0) return;
    updateWorkspaceOffset();
  }, [workspaceSignature, updateWorkspaceOffset]);

  useEffect(() => {
    const handleResize = () => {
      updateIssuesOffset();
      updateWorkspaceOffset();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [updateIssuesOffset, updateWorkspaceOffset]);

  useEffect(() => {
    if (selectedIssueId == null) return;
    const card = workspaceCardRef.current;
    if (!card || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updateWorkspaceOffset();
    });
    observer.observe(card);
    return () => {
      observer.disconnect();
    };
  }, [selectedIssueId, updateWorkspaceOffset]);

  return (
    <>
      <div className="sticky top-12 z-20 -mx-4 px-4 py-2 md:-mx-6 md:px-6">
        <nav aria-label={t("breadcrumb")} className="text-sm">
          <div className="inline-flex rounded-full border border-border/50 bg-background/80 px-3 py-1.5 shadow-sm backdrop-blur-sm">
            <ol className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <li>
                <button
                  type="button"
                  onClick={() => handleSelectEdition(null)}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {t("scanwords")}
                </button>
              </li>
              {selectedEdition && (
                <>
                  <li aria-hidden className="text-muted-foreground">
                    /
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => handleSelectEdition(selectedEdition.id)}
                      className="text-foreground/80 underline-offset-4 hover:underline"
                    >
                      {selectedEdition.name}
                    </button>
                  </li>
                </>
              )}
              {selectedIssue && (
                <>
                  <li aria-hidden className="text-muted-foreground">
                    /
                  </li>
                  <li className="text-foreground/80">{selectedIssue.label}</li>
                </>
              )}
            </ol>
          </div>
        </nav>
      </div>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row">
        <aside className="w-full lg:w-50">
          <Card className="bg-background/70">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span>{t("scanwordsEditions")}</span>
                  <Badge variant="secondary">{visibleEditions.length}</Badge>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
                          aria-label={t("scanwordsContextHint")}
                        >
                          <CircleQuestionMark className="size-4" aria-hidden />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{t("scanwordsContextHint")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t("scanwordsCreateEdition")}
                        onClick={onOpenEditionDialog}
                      >
                        <CirclePlus className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t("scanwordsCreateEdition")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {visibleEditions.length === 0 && hiddenEditions.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("scanwordsNoEditions")}</div>
              ) : visibleEditions.length > 0 ? (
                <ul className="grid gap-2">
                  {visibleEditions.map((edition) => {
                    const active = edition.id === selectedEditionId;
                    const count = edition.issues.length;
                    return (
                      <li key={edition.id}>
                        <button
                          type="button"
                          ref={setEditionButtonRef(edition.id)}
                          onClick={() => handleSelectEdition(edition.id)}
                          onContextMenu={(event) =>
                            openContextMenu(event, {
                              kind: "edition",
                              id: edition.id,
                              label: edition.name,
                              hidden: false,
                            })
                          }
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-left transition",
                            active
                              ? "border-primary/30 bg-primary/10 shadow-sm"
                              : "border-border/60 bg-background/60 hover:border-primary/30 hover:bg-muted/60",
                          )}
                          aria-pressed={active}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{edition.name}</span>
                            <Badge variant="secondary" className="ml-2">
                              {count}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("scanwordsIssuesCount", { count })}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {hiddenEditions.length > 0 && (
                <div className="mt-3 border-t border-dashed pt-3">
                  <button
                    type="button"
                    onClick={() => setShowHiddenEditions((prev) => !prev)}
                    aria-label={t("scanwordsHiddenToggleAria", { count: hiddenEditions.length })}
                    className="flex w-full items-center justify-between rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/30 hover:bg-muted/40"
                  >
                    <span className="text-sm font-medium">{t("scanwordsHiddenToggle")}</span>
                    <Badge variant="secondary" className="ml-2">
                      {hiddenEditions.length}
                    </Badge>
                  </button>
                  {showHiddenEditions && (
                    <ul className="mt-2 grid gap-2">
                      {hiddenEditions.map((edition) => (
                        <li key={edition.id}>
                          <button
                            type="button"
                            onContextMenu={(event) =>
                              openContextMenu(event, {
                                kind: "edition",
                                id: edition.id,
                                label: edition.name,
                                hidden: true,
                              })
                            }
                            className="w-full rounded-lg border border-dashed px-3 py-2 text-left text-muted-foreground transition hover:border-primary/30 hover:bg-muted/40"
                            aria-label={t("scanwordsHiddenEditionAria", { name: edition.name })}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{edition.name}</span>
                              <Badge variant="outline" className="ml-2">
                                {edition.issues.length}
                              </Badge>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        <div
          ref={issuesPanelRef}
          className={cn(
            "w-full lg:transition-[width,opacity,transform] lg:duration-300",
            selectedEdition
              ? "opacity-100 lg:w-50 lg:translate-x-0"
              : "hidden opacity-0 lg:block lg:w-0 lg:-translate-x-6 lg:overflow-hidden",
          )}
          aria-hidden={!selectedEdition}
        >
          <div
            className="transition-transform duration-300"
            style={selectedEdition ? { transform: `translateY(${issuesOffset}px)` } : undefined}
            ref={issuesCardRef}
          >
            <Card className="bg-background/70">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span>{t("scanwordsIssues")}</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
                            aria-label={t("scanwordsContextHint")}
                          >
                            <CircleQuestionMark className="size-4" aria-hidden />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("scanwordsContextHint")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={t("scanwordsCreateIssue")}
                          disabled={!selectedEdition}
                          onClick={onOpenIssueDialog}
                        >
                          <CirclePlus className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{t("scanwordsCreateIssue")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {!selectedEdition ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">{t("scanwordsSelectEdition")}</div>
                ) : visibleIssues.length === 0 && hiddenIssues.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">{t("scanwordsNoIssues")}</div>
                ) : visibleIssues.length > 0 ? (
                  <ul className="grid gap-2">
                    {visibleIssues.map((issue) => {
                      const active = issue.id === selectedIssueId;
                      return (
                        <li key={issue.id}>
                          <button
                            type="button"
                            ref={setIssueButtonRef(issue.id)}
                            onClick={() => onSelectIssue(issue.id, issue.filterTemplateId ?? null)}
                            onContextMenu={(event) =>
                              openContextMenu(event, {
                                kind: "issue",
                                id: issue.id,
                                label: issue.label,
                                hidden: false,
                              })
                            }
                            className={cn(
                              "w-full rounded-lg border px-3 py-2 text-left transition",
                              active
                                ? "border-emerald-400/40 bg-emerald-400/10 shadow-sm"
                                : "border-border/60 bg-background/60 hover:border-emerald-400/40 hover:bg-muted/60",
                            )}
                            aria-pressed={active}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{issue.label}</span>
                              <ChevronRight className="size-4 text-muted-foreground" />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {selectedEdition && hiddenIssues.length > 0 && (
                  <div className="mt-3 border-t border-dashed pt-3">
                    <button
                      type="button"
                      onClick={() => setShowHiddenIssues((prev) => !prev)}
                      aria-label={t("scanwordsHiddenToggleAria", { count: hiddenIssues.length })}
                      className="flex w-full items-center justify-between rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground transition hover:border-emerald-400/40 hover:bg-muted/40"
                    >
                      <span className="text-sm font-medium">{t("scanwordsHiddenToggle")}</span>
                      <Badge variant="secondary" className="ml-2">
                        {hiddenIssues.length}
                      </Badge>
                    </button>
                    {showHiddenIssues && (
                      <ul className="mt-2 grid gap-2">
                        {hiddenIssues.map((issue) => (
                          <li key={issue.id}>
                            <button
                              type="button"
                              onContextMenu={(event) =>
                                openContextMenu(event, {
                                  kind: "issue",
                                  id: issue.id,
                                  label: issue.label,
                                  hidden: true,
                                })
                              }
                              className="w-full rounded-lg border border-dashed px-3 py-2 text-left text-muted-foreground transition hover:border-emerald-400/40 hover:bg-muted/40"
                              aria-label={t("scanwordsHiddenIssueAria", { label: issue.label })}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">{issue.label}</span>
                                <ChevronRight className="size-4 text-muted-foreground" />
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div
          ref={workspacePanelRef}
          className={cn(
            "min-w-0 flex-1 lg:transition-[opacity,transform] lg:duration-300",
            selectedIssue ? "opacity-100 lg:translate-x-0" : "hidden opacity-0 lg:block lg:-translate-x-6",
          )}
          aria-hidden={!selectedIssue}
        >
          <div
            className="transition-transform duration-300"
            style={selectedIssue ? { transform: `translateY(${workspaceOffset}px)` } : undefined}
            ref={workspaceCardRef}
          >
            {children}
          </div>
        </div>
      </div>

      {menuMounted &&
        contextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              top: menuStyle?.top ?? contextMenu.y,
              left: menuStyle?.left ?? contextMenu.x,
            }}
            className="fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 text-sm shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleContextToggleHidden}
              className="flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-muted"
            >
              {contextMenu.target.hidden ? t("scanwordsContextUnhide") : t("scanwordsContextHide")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleContextDelete}
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
            >
              {t("scanwordsContextDelete")}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
