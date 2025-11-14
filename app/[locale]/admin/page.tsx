import type { Role } from "@prisma/client";
import { hash } from "bcrypt";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { getLocale, getTranslations } from "next-intl/server";
import { authOptions } from "@/auth";
import { AdminLangFilter } from "@/components/admin/AdminLangFilter";
import { DeletedDefinitionsClient } from "@/components/admin/DeletedDefinitionsClient";
import { DeletedWordsClient } from "@/components/admin/DeletedWordsClient";
import { ExpiredDefinitionsClient } from "@/components/admin/ExpiredDefinitionsClient";
import { UsersAdminClient } from "@/components/admin/UsersAdminClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRolePermissions, type PermissionCode, Permissions, requirePermissionAsync } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function ensureAdminAccess() {
  const session = await getServerSession(authOptions);
  await requirePermissionAsync(session?.user ?? null, Permissions.AdminAccess);
  return session;
}

export default async function AdminPanelPage({
  searchParams,
}: {
  // Next.js dynamic route APIs are async; accept Promise and await it
  searchParams: Promise<{ tab?: string | string[]; lang?: string | string[] }>;
}) {
  const t = await getTranslations();
  await ensureAdminAccess();

  const now = new Date();
  const sp = await searchParams;
  const tabParam = Array.isArray(sp?.tab) ? sp?.tab?.[0] : sp?.tab;
  const langParamRaw = Array.isArray(sp?.lang) ? sp?.lang?.[0] : sp?.lang;
  const langCode = (langParamRaw || "ru").toLowerCase();
  const cookieStore = await cookies();
  const cookieTabRaw = cookieStore.get("adminTab")?.value;
  const cookieTab =
    cookieTabRaw === "expired" || cookieTabRaw === "trash" || cookieTabRaw === "users" ? cookieTabRaw : undefined;
  const resolvedTab =
    tabParam === "expired" || tabParam === "trash" || tabParam === "users" ? tabParam : (cookieTab ?? "expired");
  const activeTab = resolvedTab as "expired" | "trash" | "users";

  const [deletedWords, deletedDefs, expired, languages] = await Promise.all([
    activeTab === "trash"
      ? prisma.word_v.findMany({
          where: { is_deleted: true, language: { is: { code: langCode } } },
          orderBy: { id: "desc" },
          take: 100,
          select: { id: true, word_text: true },
        })
      : Promise.resolve([]),
    activeTab === "trash"
      ? prisma.opred_v.findMany({
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
        })
      : Promise.resolve([]),
    activeTab === "expired"
      ? prisma.opred_v.findMany({
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
        })
      : Promise.resolve([]),
    prisma.language.findMany({
      select: { code: true, name: true },
      orderBy: { id: "asc" },
    }),
  ]);

  let users: {
    id: string;
    login: string;
    email: string | null;
    role: Role | null;
    permissions: PermissionCode[];
    createdAtIso: string;
  }[] = [];

  if (activeTab === "users") {
    const rawUsers = await prisma.user.findMany({
      orderBy: { id: "asc" },
      take: 200,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    const roles = Array.from(new Set(rawUsers.map((u) => u.role).filter((r): r is Role => Boolean(r)))) as Role[];
    const rolePermEntries = await Promise.all(
      roles.map(async (role) => {
        const perms = await getRolePermissions(role);
        return [role, Array.from(perms)] as const;
      }),
    );
    const rolePermMap = new Map<Role, PermissionCode[]>(rolePermEntries);
    users = rawUsers.map((u) => ({
      id: String(u.id),
      login: u.name ?? "",
      email: u.email ?? null,
      role: u.role,
      permissions: u.role ? (rolePermMap.get(u.role) ?? []) : [],
      createdAtIso: u.createdAt.toISOString(),
    }));
  }

  async function createUser(formData: FormData) {
    "use server";
    await ensureAdminAccess();
    const login = String(formData.get("login") ?? "").trim();
    const emailRaw = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const roleRaw = String(formData.get("role") ?? "").trim();

    if (!login || !password || password.length < 8) {
      throw new Error("Invalid payload");
    }

    const data: Parameters<typeof prisma.user.create>[0]["data"] = {
      name: login,
      passwordHash: await hash(password, 12),
      ...(roleRaw ? { role: roleRaw as Role } : {}),
    };
    if (emailRaw) data.email = emailRaw;

    await prisma.user.create({ data });
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin`);
  }

  async function restoreWord(formData: FormData) {
    "use server";
    await ensureAdminAccess();
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
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin`);
  }

  async function restoreDef(formData: FormData) {
    "use server";
    await ensureAdminAccess();
    const id = formData.get("id");
    if (!id) return;
    const defId = BigInt(String(id));
    await prisma.opred_v.update({
      where: { id: defId },
      data: { is_deleted: false },
    });
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin`);
  }

  async function extendDef(formData: FormData) {
    "use server";
    await ensureAdminAccess();
    const id = formData.get("id");
    if (!id) return;
    const defId = BigInt(String(id));
    const endStr = String(formData.get("end_date") || "");
    const dt = endStr ? new Date(endStr) : null;
    await prisma.opred_v.update({
      where: { id: defId },
      data: { end_date: dt },
    });
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin`);
  }

  async function extendDefsBulk(formData: FormData) {
    "use server";
    await ensureAdminAccess();
    const idsRaw = String(formData.get("ids") || "");
    const endStr = String(formData.get("end_date") || "");
    const ids = idsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => BigInt(s));
    const dt = endStr ? new Date(endStr) : null;
    if (ids.length > 0) {
      await prisma.opred_v.updateMany({
        where: { id: { in: ids } },
        data: { end_date: dt },
      });
    }
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin`);
  }

  async function softDeleteDef(formData: FormData) {
    "use server";
    await ensureAdminAccess();
    const id = formData.get("id");
    if (!id) return;
    const defId = BigInt(String(id));
    await prisma.opred_v.update({
      where: { id: defId },
      data: { is_deleted: true },
    });
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin`);
  }

  async function hardDeleteDefsBulk(formData: FormData) {
    "use server";
    await ensureAdminAccess();
    const idsRaw = String(formData.get("ids") || "");
    const ids = idsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => BigInt(s));
    if (ids.length > 0) {
      await prisma.opred_v.deleteMany({ where: { id: { in: ids }, is_deleted: true } });
    }
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin`);
  }

  async function hardDeleteWordsBulk(formData: FormData) {
    "use server";
    await ensureAdminAccess();
    const idsRaw = String(formData.get("ids") || "");
    const ids = idsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => BigInt(s));
    if (ids.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.opred_v.deleteMany({ where: { word_id: { in: ids }, is_deleted: true } });
        await tx.word_v.deleteMany({ where: { id: { in: ids }, is_deleted: true } });
      });
    }
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin`);
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <aside className="md:sticky md:top-4 h-max">
          <nav className="flex md:flex-col gap-2">
            <Button asChild variant={activeTab === "expired" ? "default" : "outline"}>
              <Link href={{ query: { tab: "expired", lang: langCode } }}>{t("expired")}</Link>
            </Button>
            <Button asChild variant={activeTab === "trash" ? "default" : "outline"}>
              <Link href={{ query: { tab: "trash", lang: langCode } }}>{t("deleted")}</Link>
            </Button>
            <Button asChild variant={activeTab === "users" ? "default" : "outline"}>
              <Link href={{ query: { tab: "users", lang: langCode } }}>{t("users")}</Link>
            </Button>
          </nav>
        </aside>
        <main className="space-y-6">
          <div className="w-full flex justify-self-start items-center">
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
                    <div className="text-sm text-muted-foreground">{t("noData")}</div>
                  ) : (
                    <ExpiredDefinitionsClient
                      items={expired.map((d) => ({
                        id: String(d.id),
                        word: d.word_v?.word_text ?? "",
                        text: d.text_opr,
                        endDateIso: d.end_date ? new Date(d.end_date).toISOString() : null,
                      }))}
                      extendAction={extendDef}
                      softDeleteAction={softDeleteDef}
                      extendActionBulk={extendDefsBulk}
                    />
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
                    <div className="text-sm text-muted-foreground">{t("noData")}</div>
                  ) : (
                    <DeletedWordsClient
                      items={deletedWords.map((w) => ({ id: String(w.id), word: w.word_text }))}
                      restoreAction={restoreWord}
                      hardDeleteAction={hardDeleteWordsBulk}
                    />
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
                    <div className="text-sm text-muted-foreground">{t("noData")}</div>
                  ) : (
                    <DeletedDefinitionsClient
                      items={deletedDefs.map((d) => ({
                        id: String(d.id),
                        word: `${t("word")}: ${d.word_v?.word_text ?? ""}`,
                        text: d.text_opr,
                      }))}
                      restoreAction={restoreDef}
                      hardDeleteAction={hardDeleteDefsBulk}
                    />
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === "users" && (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle>{t("users")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <UsersAdminClient users={users} createUserAction={createUser} />
                </CardContent>
              </Card>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
