import { Role } from "@prisma/client";
import { SquarePen } from "lucide-react";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_DIFFICULTIES } from "@/app/constants/constants";
import { authOptions } from "@/auth";
import { DescriptionFormFields } from "@/components/admin/pending/DescriptionFormFields";
import { DescriptionView } from "@/components/admin/pending/DescriptionView";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { PendingActions } from "@/components/PendingActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user && "role" in session.user ? (session.user as { role?: Role }).role : null) ?? null;
  if (!session?.user || role !== Role.ADMIN) {
    throw new Error("Forbidden");
  }
  return session;
}

export default async function PendingWordsPage({
  searchParams,
}: {
  // Next.js dynamic route APIs are async; accept Promise and await it
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  await ensureAdmin();
  const sp = await searchParams;
  const editParam = Array.isArray(sp?.edit) ? sp?.edit?.[0] : (sp?.edit as string | undefined);
  const [pending, languages, difficultyRows] = await Promise.all([
    prisma.pendingWords.findMany({
      where: { status: "PENDING" },
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
  for (const p of pending) {
    for (const d of p.descriptions) {
      if (!d.note) continue;
      try {
        const parsed = JSON.parse(d.note) as unknown;
        if (parsed && typeof parsed === "object") {
          const obj = parsed as { tags?: unknown };
          if (Array.isArray(obj.tags)) {
            for (const id of obj.tags) {
              if (typeof id === "number" && Number.isInteger(id)) tagIdSet.add(id);
            }
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

  const languageOptions = languages.map((l) => ({
    code: l.code,
    name: l.name,
  }));

  async function savePending(formData: FormData) {
    "use server";
    await ensureAdmin();
    const idRaw = formData.get("id");
    if (!idRaw) return;
    const pendingId = BigInt(String(idRaw));
    const pw = await prisma.pendingWords.findUnique({
      where: { id: pendingId },
      select: { targetWordId: true },
    });
    if (!pw) return;

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
    if (!pw.targetWordId && word) {
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
    await ensureAdmin();
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

      // Create opreds for each description and attach tags if encoded in note
      if (!wordId) {
        throw new Error("Invariant: target word not assigned");
      }
      const ensuredWordId: bigint = wordId;
      for (const d of pw.descriptions) {
        // Extract tags from note (JSON { tags:number[] }) and use difficulty from column
        let parsed: { tags?: number[] } | null = null;
        if (d.note) {
          try {
            const p = JSON.parse(d.note) as { tags?: number[] };
            parsed = p;
          } catch {}
        }
        const difficulty = Number.isFinite(d.difficulty as number)
          ? Math.max(0, Math.trunc(d.difficulty as number))
          : undefined;

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
    await ensureAdmin();
    const id = formData.get("id");
    if (!id) return;
    const pendingId = BigInt(String(id));

    await prisma.$transaction(async (tx) => {
      const pw = await tx.pendingWords.findUnique({
        where: { id: pendingId },
        include: { descriptions: true },
      });
      if (!pw || pw.status !== "PENDING") return;

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
                    {p.targetWordId ? (
                      <Badge variant="outline">{t("pendingExisting", { id: String(p.targetWordId) })}</Badge>
                    ) : (
                      <Badge variant="outline">{t("pendingNewWord")}</Badge>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                {String(p.id) === String(editParam ?? "") ? (
                  <form id={`edit-${String(p.id)}`} action={savePending} className="space-y-3">
                    <input type="hidden" name="id" value={String(p.id)} />
                    {p.descriptions.length === 0 && (
                      <p className="text-sm text-muted-foreground">{t("pendingNoDescriptions")}</p>
                    )}
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
                    {p.descriptions.length === 0 && (
                      <p className="text-sm text-muted-foreground">{t("pendingNoDescriptions")}</p>
                    )}
                    {p.descriptions.map((d) => {
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
                          noteText = d.note;
                        }
                      }
                      return (
                        <div key={String(d.id)} className="space-y-1">
                          <DescriptionView
                            description={d.description}
                            difficulty={d.difficulty}
                            endDateIso={d.end_date ? new Date(d.end_date).toISOString() : null}
                            createdAtIso={new Date(d.createdAt).toISOString()}
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
