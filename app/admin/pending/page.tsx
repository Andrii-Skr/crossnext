import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { PendingActions } from "@/components/PendingActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SquarePen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { DateField } from "@/components/ui/date-field";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const session = await getServerSession(authOptions);
  const role =
    (session?.user && "role" in session.user
      ? (session.user as { role?: Role }).role
      : null) ?? null;
  if (!session?.user || role !== Role.ADMIN) {
    throw new Error("Forbidden");
  }
  return session;
}

export default async function PendingWordsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const f = await getFormatter();
  await ensureAdmin();
  const sp = (await (searchParams as any)) as
    | Record<string, string | string[] | undefined>
    | undefined;
  const editParam = Array.isArray(sp?.edit)
    ? sp?.edit?.[0]
    : (sp?.edit as string | undefined);
  const pending = await prisma.pendingWords.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      descriptions: { orderBy: { createdAt: "asc" } },
      language: true,
      targetWord: true,
    },
  });

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
              if (typeof id === "number" && Number.isInteger(id))
                tagIdSet.add(id);
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

  async function savePending(formData: FormData) {
    "use server";
    await ensureAdmin();
    const idRaw = formData.get("id");
    if (!idRaw) return;
    const pendingId = BigInt(String(idRaw));
    const pw = await prisma.pendingWords.findUnique({ where: { id: pendingId }, select: { targetWordId: true } });
    if (!pw) return;

    const langCode = String(formData.get("language") || "");
    if (langCode) {
      const lang = await prisma.language.findUnique({ where: { code: langCode } });
      if (lang) {
        await prisma.pendingWords.update({ where: { id: pendingId }, data: { langId: lang.id } });
      }
    }

    const word = String(formData.get("word") || "").trim();
    if (!pw.targetWordId && word) {
      await prisma.pendingWords.update({ where: { id: pendingId }, data: { word_text: word, length: word.length } });
    }

    const updates: Array<Promise<unknown>> = [];
    for (const [key, value] of formData.entries()) {
      if (typeof key === "string" && key.startsWith("desc_text_")) {
        const idStr = key.substring("desc_text_".length);
        const descId = BigInt(idStr);
        const text = String(value).trim();
        if (text) updates.push(prisma.pendingDescriptions.update({ where: { id: descId }, data: { description: text } }));
      }
      if (typeof key === "string" && key.startsWith("desc_diff_")) {
        const idStr = key.substring("desc_diff_".length);
        const descId = BigInt(idStr);
        const difficulty = Number.parseInt(String(value), 10);
        if (Number.isFinite(difficulty)) updates.push(prisma.pendingDescriptions.update({ where: { id: descId }, data: { difficulty } }));
      }
      if (typeof key === "string" && key.startsWith("desc_end_")) {
        const idStr = key.substring("desc_end_".length);
        const descId = BigInt(idStr);
        const str = String(value);
        const dt = str ? new Date(str) : null;
        if (!str) {
          updates.push(
            prisma.pendingDescriptions.update({ where: { id: descId }, data: { end_date: null } })
          );
        } else if (dt && !isNaN(dt.getTime())) {
          updates.push(
            prisma.pendingDescriptions.update({ where: { id: descId }, data: { end_date: dt } })
          );
        }
      }
    }
    if (updates.length) await Promise.all(updates);

    revalidatePath("/admin/pending");
    redirect("/admin/pending");
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
        const difficulty = Number.isFinite((d as any).difficulty as number)
          ? Math.max(0, Math.trunc((d as any).difficulty as number))
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

    revalidatePath("/admin/pending");
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

    revalidatePath("/admin/pending");
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
                  <Badge>{(p.language as any)?.name ?? p.langId}</Badge>
                  {p.targetWordId ? (
                    <Badge variant="outline">
                      {t("pendingExisting", { id: String(p.targetWordId) })}
                    </Badge>
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
                    <p className="text-sm text-muted-foreground">
                      {t("pendingNoDescriptions")}
                    </p>
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
                          if (typeof obj.text === "string" && obj.text.trim())
                            noteText = obj.text.trim();
                          if (Array.isArray(obj.tags)) {
                            tagIdsFromNote = obj.tags.filter(
                              (x): x is number =>
                                typeof x === "number" && Number.isInteger(x),
                            );
                          }
                        }
                      } catch {
                        // If not JSON, show raw note text
                        noteText = d.note;
                      }
                    }
                    return (
                      <div key={String(d.id)} className="rounded-md border p-3">
                        {idx === 0 && !p.targetWordId && (
                          <div className="mb-2">
                            <span className="text-xs text-muted-foreground mr-2">{t("word")}</span>
                            <input
                              name="word"
                              defaultValue={p.word_text}
                              className="rounded border bg-background px-2 py-1 text-sm"
                            />
                          </div>
                        )}
                        <textarea
                          name={`desc_text_${String(d.id)}`}
                          defaultValue={d.description}
                          className="w-full min-h-12 rounded border bg-background px-2 py-1 text-sm"
                        />
                        <div className="mt-2 flex items-center gap-3 text-xs flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{t("difficultyFilterLabel")}</span>
                            <select
                              name={`desc_diff_${String(d.id)}`}
                              defaultValue={String(((d as any).difficulty ?? 1) as number)}
                              className="border rounded px-2 py-0.5 text-xs bg-background"
                            >
                              {[1,2,3,4,5].map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{t("endDate")}</span>
                            <DateField
                              value={d.end_date as any as Date | null}
                              placeholder={t("noLimit")}
                              captionLayout="dropdown"
                              clearText={t("clear")}
                              buttonClassName="h-7 px-2 text-xs w-40 justify-start"
                              hiddenInputName={`desc_end_${String(d.id)}`}
                            />
                          </div>
                          {idx === 0 && (
                            <>
                              <span className="ml-4 text-muted-foreground">{t("language")}</span>
                              <select
                                name="language"
                                defaultValue={(p.language as any)?.code ?? undefined}
                                className="border rounded px-2 py-0.5 text-xs bg-background"
                              >
                                <option value="ru">ru</option>
                                <option value="uk">uk</option>
                                <option value="en">en</option>
                              </select>
                            </>
                          )}
                        </div>
                        {tagIdsFromNote.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {tagIdsFromNote.map((id) => (
                              <Badge key={id} variant="outline">
                                <span className="mb-1 h-3">{tagNameById.get(id) ?? String(id)}</span>
                              </Badge>
                            ))}
                          </div>
                        )}
                        {noteText && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("pendingNote", { note: noteText })}
                          </div>
                        )}
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          {t("pendingCreatedAt", {
                            value: f.dateTime(d.createdAt, {
                              dateStyle: "short",
                              timeStyle: "short",
                            }),
                          })}
                        </div>
                      </div>
                    );
                  })}
                </form>
              ) : (
                <div className="space-y-3">
                  {p.descriptions.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("pendingNoDescriptions")}
                    </p>
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
                        if (typeof obj.text === "string" && obj.text.trim())
                          noteText = obj.text.trim();
                        if (Array.isArray(obj.tags)) {
                          tagIdsFromNote = obj.tags.filter(
                            (x): x is number =>
                              typeof x === "number" && Number.isInteger(x),
                          );
                        }
                      }
                    } catch {
                      // If not JSON, show raw note text
                      noteText = d.note;
                    }
                  }
                    return (
                      <div key={String(d.id)} className="rounded-md border p-3">
                        <div className="text-sm whitespace-pre-wrap break-words">{d.description}</div>
                      <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                        <span className="text-muted-foreground">{t("difficultyFilterLabel")}</span>
                        <Badge variant="outline">{((d as any).difficulty ?? 1) as number}</Badge>
                        {(d as any).end_date ? (
                          <Badge variant="outline">
                            {t("until", { value: f.dateTime((d as any).end_date, { dateStyle: "short" }) })}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        {t("pendingCreatedAt", {
                          value: f.dateTime(d.createdAt, {
                            dateStyle: "short",
                            timeStyle: "short",
                          }),
                        })}
                      </div>
                      {tagIdsFromNote.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tagIdsFromNote.map((id) => (
                            <Badge key={id} variant="outline">
                              <span className="mb-1 h-3">{tagNameById.get(id) ?? String(id)}</span>
                            </Badge>
                          ))}
                        </div>
                      )}
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
                      <a href="/admin/pending">{t("cancel")}</a>
                    </Button>
                    {/* Save second (primary) */}
                    <Button type="submit" form={`edit-${String(p.id)}`} size="sm">
                      {t("save")}
                    </Button>
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
