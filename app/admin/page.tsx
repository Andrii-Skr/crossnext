import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { getFormatter, getTranslations } from "next-intl/server";
import { authOptions } from "@/auth";
import { ServerActionButton } from "@/components/admin/ServerActionButton";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateFieldHidden } from "@/components/ui/date-field-hidden";
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

import { AdminLangFilter } from "@/components/admin/AdminLangFilter";

export default async function AdminPanelPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[]; lang?: string | string[] }>;
}) {
  const t = await getTranslations();
  const f = await getFormatter();
  await ensureAdmin();

  const now = new Date();
  const sp = (await (searchParams ?? Promise.resolve(undefined))) as
    | { tab?: string | string[]; lang?: string | string[] }
    | undefined;
  const tabParam = Array.isArray(sp?.tab) ? sp?.tab?.[0] : sp?.tab;
  const langParamRaw = Array.isArray(sp?.lang) ? sp?.lang?.[0] : sp?.lang;
  const langCode = (langParamRaw || "ru").toLowerCase();
  const activeTab = (tabParam === "trash" ? "trash" : "expired") as
    | "expired"
    | "trash";

  const [deletedWords, deletedDefs, expired, languages] = await Promise.all([
    prisma.word_v.findMany({
      where: { is_deleted: true, language: { is: { code: langCode } } },
      orderBy: { id: "desc" },
      take: 100,
      select: { id: true, word_text: true },
    }),
    prisma.opred_v.findMany({
      where: {
        is_deleted: true,
        language: { is: { code: langCode } },
        word_v: { is_deleted: false, language: { is: { code: langCode } } },
      },
      orderBy: { id: "desc" },
      take: 200,
      select: {
        id: true,
        text_opr: true,
        word_v: { select: { id: true, word_text: true, is_deleted: true } },
      },
    }),
    prisma.opred_v.findMany({
      where: {
        is_deleted: false,
        end_date: { lt: now },
        language: { is: { code: langCode } },
        word_v: { is_deleted: false, language: { is: { code: langCode } } },
      },
      orderBy: { end_date: "desc" },
      take: 200,
      select: {
        id: true,
        text_opr: true,
        end_date: true,
        word_v: { select: { id: true, word_text: true } },
      },
    }),
    prisma.language.findMany({
      select: { code: true, name: true },
      orderBy: { id: "asc" },
    }),
  ]);

  async function restoreWord(formData: FormData) {
    "use server";
    await ensureAdmin();
    const id = formData.get("id");
    if (!id) return;
    const wordId = BigInt(String(id));
    await prisma.$transaction(async (tx) => {
      await tx.word_v.update({
        where: { id: wordId },
        data: { is_deleted: false },
      });
      await tx.opred_v.updateMany({
        where: { word_id: wordId },
        data: { is_deleted: false },
      });
    });
    revalidatePath("/admin");
  }

  async function restoreDef(formData: FormData) {
    "use server";
    await ensureAdmin();
    const id = formData.get("id");
    if (!id) return;
    const defId = BigInt(String(id));
    await prisma.opred_v.update({
      where: { id: defId },
      data: { is_deleted: false },
    });
    revalidatePath("/admin");
  }

  async function extendDef(formData: FormData) {
    "use server";
    await ensureAdmin();
    const id = formData.get("id");
    if (!id) return;
    const defId = BigInt(String(id));
    const endStr = String(formData.get("end_date") || "");
    const dt = endStr ? new Date(endStr) : null;
    await prisma.opred_v.update({
      where: { id: defId },
      data: { end_date: dt },
    });
    revalidatePath("/admin");
  }

  async function softDeleteDef(formData: FormData) {
    "use server";
    await ensureAdmin();
    const id = formData.get("id");
    if (!id) return;
    const defId = BigInt(String(id));
    await prisma.opred_v.update({
      where: { id: defId },
      data: { is_deleted: true },
    });
    revalidatePath("/admin");
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <aside className="md:sticky md:top-4 h-max">
          <nav className="flex md:flex-col gap-2">
            <Button
              asChild
              variant={activeTab === "expired" ? "default" : "outline"}
            >
              <Link href={{ query: { tab: "expired", lang: langCode } }}>
                {t("expired")}
              </Link>
            </Button>
            <Button
              asChild
              variant={activeTab === "trash" ? "default" : "outline"}
            >
              <Link href={{ query: { tab: "trash", lang: langCode } }}>
                {t("deleted")}
              </Link>
            </Button>
          </nav>
        </aside>
        <main className="space-y-6">
          <div className="w-full flex justify-end items-center">
            <AdminLangFilter items={languages} value={langCode} />
          </div>

          {activeTab === "expired" && (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t("expired")} — {t("definitions")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {expired.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      {t("noData")}
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {expired.map((d) => (
                        <li
                          key={String(d.id)}
                          className="flex items-start justify-between gap-3 py-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-rose-700 mb-1">
                              {t("word")}: {d.word_v?.word_text}
                            </div>
                            {d.end_date ? (
                              <div className="text-xs text-muted-foreground mb-1">
                                {t("expiresAt", {
                                  value: f.dateTime(d.end_date, {
                                    dateStyle: "short",
                                  }),
                                })}
                              </div>
                            ) : null}
                            <div className="break-words">{d.text_opr}</div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <form
                              action={extendDef}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="hidden"
                                name="id"
                                value={String(d.id)}
                              />
                              <DateFieldHidden
                                placeholder={t("noLimit")}
                                captionLayout="dropdown"
                                clearText={t("clear")}
                                buttonClassName="h-8 px-2 text-xs w-48 justify-start"
                                name="end_date"
                              />
                              <ServerActionSubmit
                                action={extendDef}
                                labelKey="save"
                                successKey="definitionUpdated"
                                size="sm"
                              />
                            </form>
                            <ServerActionButton
                              id={String(d.id)}
                              action={softDeleteDef}
                              labelKey="delete"
                              successKey="definitionDeleted"
                              size="sm"
                              variant="destructive"
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === "trash" && (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t("deleted")} — {t("words")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deletedWords.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      {t("noData")}
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {deletedWords.map((w) => (
                        <li
                          key={String(w.id)}
                          className="flex items-center gap-3 py-2"
                        >
                          <div className="flex-1 break-words">
                            {w.word_text}
                          </div>
                          <ServerActionButton
                            id={String(w.id)}
                            action={restoreWord}
                            labelKey="restore"
                            successKey="restored"
                            size="sm"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {t("deleted")} — {t("definitions")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deletedDefs.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      {t("noData")}
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {deletedDefs.map((d) => (
                        <li
                          key={String(d.id)}
                          className="flex items-start gap-3 py-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-emerald-700 mb-1">
                              {t("word")}: {d.word_v?.word_text}
                            </div>
                            <div className="break-words">{d.text_opr}</div>
                          </div>
                          <ServerActionButton
                            id={String(d.id)}
                            action={restoreDef}
                            labelKey="restore"
                            successKey="restored"
                            size="sm"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
