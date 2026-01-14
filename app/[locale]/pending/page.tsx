import { SquarePen } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  approvePendingAction as approveAction,
  ensurePendingAccess,
  rejectPendingAction as rejectAction,
  savePendingAction as savePending,
} from "@/app/actions/admin-pending";
import { CreatedAt } from "@/components/admin/pending/CreatedAt";
import { DefinitionCarousel } from "@/components/admin/pending/DefinitionCarousel";
import { DescriptionFormFields } from "@/components/admin/pending/DescriptionFormFields";
import { DescriptionView } from "@/components/admin/pending/DescriptionView";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { PendingActions } from "@/components/PendingActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { prisma } from "@/lib/prisma";
import { getSearchParamValue, type SearchParamsInput } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export default async function PendingWordsPage({
  searchParams,
}: {
  // Next.js dynamic route APIs are async; accept Promise and await it
  searchParams: Promise<SearchParamsInput>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const { scope, currentLabel, userId } = await ensurePendingAccess();
  const sp = await searchParams;
  const editParam = getSearchParamValue(sp, "edit");
  const ownerOr: Array<Record<string, unknown>> = [];
  if (userId != null) {
    ownerOr.push({ createBy: userId }, { descriptions: { some: { createBy: userId } } });
  }
  ownerOr.push({ note: { contains: `"createdBy":"${currentLabel.replace(/"/g, '\\"')}"` } });
  const [pending, languages, difficultyRows] = await Promise.all([
    prisma.pendingWords.findMany({
      where:
        scope === "all"
          ? { status: "PENDING" }
          : {
              status: "PENDING",
              OR: ownerOr,
            },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        descriptions: { orderBy: { createdAt: "asc" } },
        language: true,
        targetWord: true,
      },
    }),
    prisma.language.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { id: "asc" },
    }),
    prisma.difficulty.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);
  const difficulties = difficultyRows.map((r) => r.id);

  // Collect tag IDs from description notes (JSON: { tags?: number[], text?: string }) and fetch names once
  const tagIdSet = new Set<number>();
  // Collect original opred ids for editDef cards to show "from → to"
  const originalOpredIdSet = new Set<bigint>();
  for (const p of pending) {
    for (const d of p.descriptions) {
      if (!d.note) continue;
      try {
        const parsed = JSON.parse(d.note) as unknown;
        if (parsed && typeof parsed === "object") {
          const obj = parsed as { tags?: unknown; opredId?: unknown; kind?: unknown };
          if (Array.isArray(obj.tags)) {
            for (const id of obj.tags) {
              if (typeof id === "number" && Number.isInteger(id)) tagIdSet.add(id);
            }
          }
          if (obj.kind === "editDef" && typeof obj.opredId === "string" && obj.opredId) {
            try {
              originalOpredIdSet.add(BigInt(obj.opredId));
            } catch {}
          }
        }
      } catch {}
    }
  }
  const tagIds = [...tagIdSet];
  const tagRows = tagIds.length
    ? await prisma.tag.findMany({
        where: { id: { in: tagIds } },
        select: { id: true, name: true },
      })
    : [];
  const tagNameById = new Map(tagRows.map((t) => [t.id, t.name] as const));
  const tagNames: Record<string, string> = Object.fromEntries(tagNameById);

  // Fetch original definitions for editDef preview
  const originalOpreds = originalOpredIdSet.size
    ? await prisma.opred_v.findMany({
        where: { id: { in: Array.from(originalOpredIdSet) } },
        select: { id: true, text_opr: true, difficulty: true, end_date: true },
      })
    : [];
  const originalById = new Map(originalOpreds.map((o) => [String(o.id), o] as const));

  const languageOptions = languages.map((l) => ({
    code: l.code,
    name: l.name,
  }));

  const canApprove = scope === "all";

  return (
    <TooltipProvider>
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pending.map((p) => (
            <Card key={String(p.id)} className="flex h-full flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{p.word_text}</span>
                  <div className="flex items-center gap-2">
                    <Badge>{p.language?.name ?? p.langId}</Badge>
                    {(() => {
                      let kind: string | null = null;
                      if (p.note) {
                        try {
                          const obj = JSON.parse(p.note) as { kind?: string };
                          if (obj?.kind) kind = obj.kind;
                        } catch {}
                      }
                      if (!p.targetWordId) {
                        return <Badge variant="outline">{t("pendingNewWord")}</Badge>;
                      }
                      const isEdit = kind === "editWord" || kind === "editDef";
                      return (
                        <Badge variant="outline">{t(isEdit ? "pendingOperationEdit" : "pendingOperationAdd")}</Badge>
                      );
                    })()}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                {/* Metadata: createdBy only (no CreatedAt display) */}
                <div className="mb-2 text-xs text-muted-foreground">
                  <CreatedAt iso={p.createdAt.toISOString()} />
                  {(() => {
                    let by: string | null = null;
                    if (p.note) {
                      try {
                        const obj = JSON.parse(p.note) as { createdBy?: string };
                        if (obj?.createdBy) by = obj.createdBy;
                      } catch {}
                    }
                    return by ? <div>{t("pendingCreatedBy", { value: by })}</div> : null;
                  })()}
                </div>
                {/* Rename mapping */}
                {p.targetWordId && p.descriptions.length === 0 && p.targetWord && (
                  <p className="mb-3 text-sm">
                    {t("pendingRenameFromTo", { from: p.targetWord.word_text, to: p.word_text })}
                  </p>
                )}
                {String(p.id) === String(editParam ?? "") ? (
                  <form
                    id={`edit-${String(p.id)}`}
                    action={savePending}
                    className="space-y-3"
                    autoComplete="off"
                    suppressHydrationWarning
                  >
                    <input type="hidden" name="id" value={String(p.id)} />
                    {p.descriptions.length === 0 &&
                      (() => {
                        let wordNoteText: string | null = null;
                        if (p.note) {
                          try {
                            const parsed = JSON.parse(p.note) as unknown;
                            if (parsed && typeof parsed === "object") {
                              const obj = parsed as { text?: unknown };
                              if (typeof obj.text === "string" && obj.text.trim()) wordNoteText = obj.text.trim();
                            }
                          } catch {
                            // non-JSON fallback if ever needed
                          }
                        }
                        return (
                          <div className="space-y-2">
                            {p.targetWordId && (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">{t("word")}</span>
                                <Input name="word" defaultValue={p.word_text} className="h-7 w-full text-xs" />
                              </div>
                            )}
                            <p className="text-sm text-muted-foreground">
                              {wordNoteText ? t("pendingNote", { note: wordNoteText }) : t("pendingNoDescriptions")}
                            </p>
                          </div>
                        );
                      })()}
                    {p.descriptions.length > 0 && (
                      <DefinitionCarousel
                        items={p.descriptions.map((d, idx) => {
                          let noteText: string | null = null;
                          let tagIdsFromNote: number[] = [];
                          if (d.note) {
                            try {
                              const parsed = JSON.parse(d.note) as unknown;
                              if (parsed && typeof parsed === "object") {
                                const obj = parsed as {
                                  text?: unknown;
                                  tags?: unknown;
                                };
                                if (typeof obj.text === "string" && obj.text.trim()) noteText = obj.text.trim();
                                if (Array.isArray(obj.tags)) {
                                  tagIdsFromNote = obj.tags.filter(
                                    (x): x is number => typeof x === "number" && Number.isInteger(x),
                                  );
                                }
                              }
                            } catch {
                              noteText = d.note; // non-JSON fallback
                            }
                          }
                          return {
                            key: String(d.id),
                            node: (
                              <div className="rounded-md border bg-background p-3">
                                <DescriptionFormFields
                                  idx={idx}
                                  descId={String(d.id)}
                                  description={d.description}
                                  endDateIso={d.end_date ? new Date(d.end_date).toISOString() : null}
                                  showWordInput={!p.targetWordId && idx === 0}
                                  defaultWord={p.word_text}
                                  languages={languageOptions}
                                  defaultLanguageCode={p.language?.code ?? undefined}
                                  difficulties={difficulties}
                                  defaultDifficulty={d.difficulty ?? 1}
                                  initialTagIds={tagIdsFromNote}
                                  tagNames={tagNames}
                                  disableLanguage={Boolean(p.targetWordId)}
                                  allowDelete={p.descriptions.length > 1}
                                />
                                {noteText && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {t("pendingNote", { note: noteText })}
                                  </div>
                                )}
                              </div>
                            ),
                          };
                        })}
                      />
                    )}
                  </form>
                ) : (
                  <div className="space-y-3">
                    {p.descriptions.length === 0 &&
                      (() => {
                        let wordNoteText: string | null = null;
                        if (p.note) {
                          try {
                            const parsed = JSON.parse(p.note) as unknown;
                            if (parsed && typeof parsed === "object") {
                              const obj = parsed as { text?: unknown };
                              if (typeof obj.text === "string" && obj.text.trim()) wordNoteText = obj.text.trim();
                            }
                          } catch {
                            // non-JSON fallback if ever needed
                          }
                        }
                        return (
                          <p className="text-sm text-muted-foreground">
                            {wordNoteText ? t("pendingNote", { note: wordNoteText }) : t("pendingNoDescriptions")}
                          </p>
                        );
                      })()}
                    {p.descriptions.length > 0 && (
                      <DefinitionCarousel
                        items={p.descriptions.map((d) => {
                          let noteText: string | null = null;
                          let tagIdsFromNote: number[] = [];
                          let originalText: string | null = null;
                          let isEditDef = false;
                          if (d.note) {
                            try {
                              const parsed = JSON.parse(d.note) as unknown;
                              if (parsed && typeof parsed === "object") {
                                const obj = parsed as {
                                  text?: unknown;
                                  tags?: unknown;
                                  kind?: unknown;
                                  opredId?: unknown;
                                };
                                if (typeof obj.text === "string" && obj.text.trim()) noteText = obj.text.trim();
                                if (Array.isArray(obj.tags)) {
                                  tagIdsFromNote = obj.tags.filter(
                                    (x): x is number => typeof x === "number" && Number.isInteger(x),
                                  );
                                }
                                if (obj.kind === "editDef" && typeof obj.opredId === "string") {
                                  const orig = originalById.get(obj.opredId);
                                  if (orig) originalText = orig.text_opr;
                                  isEditDef = true;
                                }
                              }
                            } catch {
                              noteText = d.note;
                            }
                          }
                          return {
                            key: String(d.id),
                            node: (
                              <div className="space-y-2 rounded-md border bg-background p-3">
                                {isEditDef && originalText && (
                                  <div className="text-xs text-muted-foreground">
                                    {t("pendingDefFromTo", { from: originalText, to: d.description })}
                                  </div>
                                )}
                                <DescriptionView
                                  description={d.description}
                                  difficulty={d.difficulty}
                                  endDateIso={d.end_date ? new Date(d.end_date).toISOString() : null}
                                  tagIds={tagIdsFromNote}
                                  tagNames={tagNames}
                                />
                                {noteText && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {t("pendingNote", { note: noteText })}
                                  </div>
                                )}
                              </div>
                            ),
                          };
                        })}
                      />
                    )}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {String(p.id) === String(editParam ?? "") ? (
                    <>
                      {/* Cancel first (secondary) */}

                      <Button asChild variant="outline" size="sm">
                        <a href={`/${locale}/pending`}>{t("cancel")}</a>
                      </Button>
                      {/* Save button moved inside the form for proper typing */}
                      <ServerActionSubmit
                        action={savePending}
                        variant="default"
                        labelKey="save"
                        successKey="pendingSaved"
                        size="sm"
                        formId={`edit-${String(p.id)}`}
                      />
                    </>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button asChild variant="outline" size="sm">
                          <a href={`?edit=${String(p.id)}`} aria-label={t("edit")}>
                            <SquarePen className="size-4" />
                          </a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("edit")}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {String(p.id) !== String(editParam ?? "") && (
                  <PendingActions
                    id={String(p.id)}
                    descriptionCount={p.descriptions.length}
                    approveAction={approveAction}
                    rejectAction={rejectAction}
                    canApprove={canApprove}
                  />
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
