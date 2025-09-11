import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { Role } from "@prisma/client";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFormatter, getTranslations } from "next-intl/server";
import { PendingActions } from "@/components/PendingActions";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? null;
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
      for (const d of pw.descriptions) {
        const opred = await tx.opred_v.create({
          data: {
            word_id: wordId!,
            text_opr: d.description,
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

      await tx.pendingWords.update({ where: { id: pw.id }, data: { status: "REJECTED" } });
      for (const d of pw.descriptions) {
        await tx.pendingDescriptions.update({ where: { id: d.id }, data: { status: "REJECTED" } });
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
                    <Badge variant="outline">{t("pendingExisting", { id: String(p.targetWordId) })}</Badge>
                  ) : (
                    <Badge variant="outline">{t("pendingNewWord")}</Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {p.descriptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("pendingNoDescriptions")}</p>
                )}
                {p.descriptions.map((d) => (
                  <div key={String(d.id)} className="rounded-md border p-3">
                    <div className="text-sm whitespace-pre-wrap break-words">{d.description}</div>
                    {d.note && (
                      <div className="mt-2 text-xs text-muted-foreground">{t("pendingNote", { note: d.note })}</div>
                    )}
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {t("pendingCreatedAt", { value: f.dateTime(d.createdAt, { dateStyle: "short", timeStyle: "short" }) })}
                    </div>
                  </div>
                ))}
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
