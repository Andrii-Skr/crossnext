import { SquarePen } from "lucide-react";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_DIFFICULTIES } from "@/app/constants/constants";
import { authOptions } from "@/auth";
import { CreatedAt } from "@/components/admin/pending/CreatedAt";
import { DescriptionFormFields } from "@/components/admin/pending/DescriptionFormFields";
import { DescriptionView } from "@/components/admin/pending/DescriptionView";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { PendingActions } from "@/components/PendingActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { hasPermissionAsync, Permissions } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PendingScope = "all" | "own";

function userLabel(user: { email?: string | null; name?: string | null; id?: string | null } | null): string {
  if (!user) return "unknown";
  return (user.email || user.name || user.id || "unknown") as string;
}

function isCreatedBy(note: string | null | undefined, label: string): boolean {
  if (!note) return false;
  try {
    const parsed = JSON.parse(note) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as { createdBy?: unknown };
      return typeof obj.createdBy === "string" && obj.createdBy === label;
    }
  } catch {
    // ignore non-JSON notes
  }
  return false;
}

async function ensurePendingAccess(): Promise<{ scope: PendingScope; currentLabel: string }> {
  const session = await getServerSession(authOptions);
  const user = session?.user ?? null;
  if (!user) {
    const err = new Error("Unauthorized");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  const { role, email, name, id } = user as {
    role?: string | null;
    email?: string | null;
    name?: string | null;
    id?: string | null;
  };
  const roleStr = role ?? null;
  const currentLabel = userLabel({ email, name, id });

  // Moderators (ADMIN / CHIEF_EDITOR with pending:review) can see/approve all
  const hasGlobal = await hasPermissionAsync(roleStr ?? null, Permissions.PendingReview);
  if (hasGlobal) {
    return { scope: "all", currentLabel };
  }

  // Editors see only their own cards and cannot approve
  if (roleStr === "EDITOR") {
    return { scope: "own", currentLabel };
  }

  const err = new Error("Forbidden");
  (err as Error & { status?: number }).status = 403;
  throw err;
}

export default async function PendingWordsPage({
  searchParams,
}: {
  // Next.js dynamic route APIs are async; accept Promise and await it
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const { scope, currentLabel } = await ensurePendingAccess();
  const sp = await searchParams;
  const editParam = Array.isArray(sp?.edit) ? sp?.edit?.[0] : (sp?.edit as string | undefined);
  const [pending, languages, difficultyRows] = await Promise.all([
    prisma.pendingWords.findMany({
      where:
        scope === "all"
          ? { status: "PENDING" }
          : {
              status: "PENDING",
              note: { contains: `"createdBy":"${currentLabel.replace(/"/g, '\\"')}"` },
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
    prisma.opred_v.groupBy({
      by: ["difficulty"],
      where: { is_deleted: false },
      _count: { _all: true },
      orderBy: { difficulty: "asc" },
    }),
  ]);
  const difficulties = difficultyRows.map((r) => r.difficulty);

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

  async function savePending(formData: FormData) {
    "use server";
    const { scope, currentLabel } = await ensurePendingAccess();
    const idRaw = formData.get("id");
    if (!idRaw) return;
    const pendingId = BigInt(String(idRaw));
    const pw = await prisma.pendingWords.findUnique({
      where: { id: pendingId },
      select: { targetWordId: true, note: true },
    });
    if (!pw) return;

    if (scope === "own" && !isCreatedBy(pw.note, currentLabel)) {
      return;
    }

    const langCode = String(formData.get("language") || "");
    if (langCode && !pw.targetWordId) {
      const lang = await prisma.language.findUnique({
        where: { code: langCode },
      });
      if (lang) {
        await prisma.pendingWords.update({
          where: { id: pendingId },
          data: { langId: lang.id },
        });
        await prisma.pendingDescriptions.updateMany({
          where: { pendingWordId: pendingId },
          data: { langId: lang.id },
        });
      }
    }

    const word = String(formData.get("word") || "").trim();
    if (word) {
      await prisma.pendingWords.update({
        where: { id: pendingId },
        data: { word_text: word, length: word.length },
      });
    }

    const updates: Array<Promise<unknown>> = [];
    const tagsToApply = new Map<bigint, number[]>();
    for (const [key, value] of formData.entries()) {
      if (typeof key === "string" && key.startsWith("desc_text_")) {
        const idStr = key.substring("desc_text_".length);
        const descId = BigInt(idStr);
        const text = String(value).trim();
        if (text)
          updates.push(
            prisma.pendingDescriptions.update({
              where: { id: descId },
              data: { description: text },
            }),
          );
      }
      if (typeof key === "string" && key.startsWith("desc_diff_")) {
        const idStr = key.substring("desc_diff_".length);
        const descId = BigInt(idStr);
        const difficulty = Number.parseInt(String(value), 10);
        if (Number.isFinite(difficulty))
          updates.push(
            prisma.pendingDescriptions.update({
              where: { id: descId },
              data: { difficulty },
            }),
          );
      }
      if (typeof key === "string" && key.startsWith("desc_end_")) {
        const idStr = key.substring("desc_end_".length);
        const descId = BigInt(idStr);
        const str = String(value);
        const dt = str ? new Date(str) : null;
        if (!str) {
          updates.push(
            prisma.pendingDescriptions.update({
              where: { id: descId },
              data: { end_date: null },
            }),
          );
        } else if (dt && !Number.isNaN(dt.getTime())) {
          updates.push(
            prisma.pendingDescriptions.update({
              where: { id: descId },
              data: { end_date: dt },
            }),
          );
        }
      }
      if (typeof key === "string" && key.startsWith("desc_tags_")) {
        const idStr = key.substring("desc_tags_".length);
        const descId = BigInt(idStr);
        let arr: number[] = [];
        try {
          const parsed = JSON.parse(String(value));
          if (Array.isArray(parsed)) {
            arr = parsed.filter((x) => typeof x === "number" && Number.isInteger(x)).map((x) => x as number);
          }
        } catch {}
        tagsToApply.set(descId, arr);
      }
    }
    if (updates.length) await Promise.all(updates);

    if (tagsToApply.size > 0) {
      const tagUpdates: Promise<unknown>[] = [];
      for (const [descId, tags] of tagsToApply.entries()) {
        tagUpdates.push(
          (async () => {
            const row = await prisma.pendingDescriptions.findUnique({
              where: { id: descId },
              select: { note: true },
            });
            let obj: Record<string, unknown> = {};
            if (row?.note) {
              try {
                const parsed = JSON.parse(row.note) as unknown;
                if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
              } catch {}
            }
            obj.tags = tags;
            await prisma.pendingDescriptions.update({
              where: { id: descId },
              data: { note: JSON.stringify(obj) },
            });
          })(),
        );
      }
      await Promise.all(tagUpdates);
    }

    revalidatePath(`/${locale}/admin/pending`);
  }

  async function approveAction(formData: FormData) {
    "use server";
    const { scope } = await ensurePendingAccess();
    if (scope === "own") {
      const err = new Error("Forbidden");
      (err as Error & { status?: number }).status = 403;
      throw err;
    }
    const id = formData.get("id");
    if (!id) return;
    const pendingId = BigInt(String(id));

    await prisma.$transaction(async (tx) => {
      const pw = await tx.pendingWords.findUnique({
        where: { id: pendingId },
        include: { descriptions: true },
      });
      if (!pw || pw.status !== "PENDING") return;

      let wordId = pw.targetWordId ?? null;

      if (!wordId) {
        const createdWord = await tx.word_v.create({
          data: {
            word_text: pw.word_text,
            length: pw.length,
            korny: "",
            langId: pw.langId,
          },
          select: { id: true },
        });
        wordId = createdWord.id;
      }

      // If this pending card represents a word rename (no descriptions, but has targetWordId), apply it
      if (wordId && pw.descriptions.length === 0) {
        await tx.word_v.update({
          where: { id: wordId },
          data: { word_text: pw.word_text, length: pw.length },
        });
      }

      // Create or update opreds for each description and attach tags if encoded in note
      if (!wordId) {
        throw new Error("Invariant: target word not assigned");
      }
      const ensuredWordId: bigint = wordId;
      for (const d of pw.descriptions) {
        // Extract info from note
        let parsed: { tags?: number[]; kind?: string; opredId?: string } | null = null;
        if (d.note) {
          try {
            const p = JSON.parse(d.note) as { tags?: number[]; kind?: string; opredId?: string };
            parsed = p;
          } catch {}
        }
        const difficulty = Number.isFinite(d.difficulty as number)
          ? Math.max(0, Math.trunc(d.difficulty as number))
          : undefined;

        // If this description is an edit to an existing definition, update it in place
        if (parsed?.kind === "editDef" && parsed.opredId) {
          const targetId = BigInt(parsed.opredId);
          await tx.opred_v.update({
            where: { id: targetId },
            data: {
              text_opr: d.description,
              length: d.description.length,
              ...(difficulty !== undefined ? { difficulty } : {}),
              ...(d.end_date ? { end_date: d.end_date } : {}),
            },
          });
          await tx.pendingDescriptions.update({
            where: { id: d.id },
            data: { status: "APPROVED", approvedOpredId: targetId },
          });
          continue;
        }

        // Otherwise, create a new definition for this word
        const opred = await tx.opred_v.create({
          data: {
            word_id: ensuredWordId,
            text_opr: d.description,
            length: d.description.length,
            langId: pw.langId,
            ...(difficulty !== undefined ? { difficulty } : {}),
            ...(d.end_date ? { end_date: d.end_date } : {}),
          },
          select: { id: true },
        });

        // Attach tags if present
        if (parsed?.tags && parsed.tags.length > 0) {
          for (const tagId of parsed.tags) {
            await tx.opredTag.create({
              data: { opredId: opred.id, tagId },
            });
          }
        }

        await tx.pendingDescriptions.update({
          where: { id: d.id },
          data: { status: "APPROVED", approvedOpredId: opred.id },
        });
      }

      await tx.pendingWords.update({
        where: { id: pw.id },
        data: { status: "APPROVED", targetWordId: wordId ?? undefined },
      });
    });

    revalidatePath(`/${locale}/admin/pending`);
  }

  async function rejectAction(formData: FormData) {
    "use server";
    const { scope, currentLabel } = await ensurePendingAccess();
    const id = formData.get("id");
    if (!id) return;
    const pendingId = BigInt(String(id));

    await prisma.$transaction(async (tx) => {
      const pw = await tx.pendingWords.findUnique({
        where: { id: pendingId },
        include: { descriptions: true },
      });
      if (!pw || pw.status !== "PENDING") return;

      if (scope === "own" && !isCreatedBy(pw.note, currentLabel)) {
        return;
      }

      await tx.pendingWords.update({
        where: { id: pw.id },
        data: { status: "REJECTED" },
      });
      for (const d of pw.descriptions) {
        await tx.pendingDescriptions.update({
          where: { id: d.id },
          data: { status: "REJECTED" },
        });
      }
    });

    revalidatePath(`/${locale}/admin/pending`);
  }

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
                  <form id={`edit-${String(p.id)}`} action={savePending} className="space-y-3">
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
                    {p.descriptions.map((d, idx) => {
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
                      return (
                        <div key={String(d.id)} className="rounded-md border p-3">
                          <DescriptionFormFields
                            idx={idx}
                            descId={String(d.id)}
                            description={d.description}
                            endDateIso={d.end_date ? new Date(d.end_date).toISOString() : null}
                            showWordInput={!p.targetWordId && idx === 0}
                            defaultWord={p.word_text}
                            languages={languageOptions}
                            defaultLanguageCode={p.language?.code ?? undefined}
                            difficulties={
                              difficulties.length ? difficulties : (DEFAULT_DIFFICULTIES as readonly number[])
                            }
                            defaultDifficulty={d.difficulty ?? 1}
                            initialTagIds={tagIdsFromNote}
                            tagNames={tagNames}
                            disableLanguage={Boolean(p.targetWordId)}
                          />
                          {noteText && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {t("pendingNote", { note: noteText })}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                    {p.descriptions.map((d) => {
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
                      return (
                        <div key={String(d.id)} className="space-y-1">
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
                      );
                    })}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {String(p.id) === String(editParam ?? "") ? (
                    <>
                      {/* Cancel first (secondary) */}

                      <Button asChild variant="outline" size="sm">
                        <a href={`/${locale}/admin/pending`}>{t("cancel")}</a>
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
