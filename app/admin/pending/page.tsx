import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { getFormatter, getTranslations } from "next-intl/server";
import { authOptions } from "@/auth";
import { PendingActions } from "@/components/PendingActions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

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

export default async function PendingWordsPage() {
  const t = await getTranslations();
  const f = await getFormatter();
  await ensureAdmin();
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
        const opred = await tx.opred_v.create({
          data: {
            word_id: ensuredWordId,
            text_opr: d.description,
            length: d.description.length,
            langId: pw.langId,
          },
          select: { id: true },
        });

        // Try parse tags from note: JSON { tags: number[] }
        if (d.note) {
          try {
            const parsed = JSON.parse(d.note) as { tags?: number[] };
            if (parsed?.tags && parsed.tags.length > 0) {
              for (const tagId of parsed.tags) {
                await tx.opredTag.create({
                  data: { opredId: opred.id, tagId },
                });
              }
            }
          } catch {}
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
    <div className="container mx-auto px-4 py-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pending.map((p) => (
          <Card key={String(p.id)}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="truncate">{p.word_text}</span>
                <div className="flex items-center gap-2">
                  <Badge>{p.language?.name ?? p.langId}</Badge>
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
            <CardContent>
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
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {d.description}
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
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <PendingActions
                id={String(p.id)}
                descriptionCount={p.descriptions.length}
                approveAction={approveAction}
                rejectAction={rejectAction}
              />
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
