import type { Role } from "@prisma/client";
import { cookies } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  createUserAction as createUser,
  ensureAdminAccess,
  extendDefAction as extendDef,
  extendDefsBulkAction as extendDefsBulk,
  hardDeleteDefsBulkAction as hardDeleteDefsBulk,
  hardDeleteWordsBulkAction as hardDeleteWordsBulk,
  restoreDefAction as restoreDef,
  restoreWordAction as restoreWord,
  softDeleteDefAction as softDeleteDef,
  toggleUserDeletionAction as toggleUserDeletion,
  updateUserAction as updateUser,
} from "@/app/actions/admin";
import { AdminLangFilter } from "@/components/admin/AdminLangFilter";
import { DeletedDefinitionsClient } from "@/components/admin/DeletedDefinitionsClient";
import { DeletedWordsClient } from "@/components/admin/DeletedWordsClient";
import { ExpiredDefinitionsClient } from "@/components/admin/ExpiredDefinitionsClient";
import { UsersAdminClient } from "@/components/admin/UsersAdminClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { baseRoles, resolveAllowedRoles } from "@/lib/admin/roles";
import { getRolePermissions, type PermissionCode } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function AdminPanelPage({
  searchParams,
}: {
  // Next.js dynamic route APIs are async; accept Promise and await it
  searchParams: Promise<{ tab?: string | string[]; lang?: string | string[] }>;
}) {
  const t = await getTranslations();
  const session = await ensureAdminAccess();
  const sessionRoleRaw = (session?.user as { role?: Role | string | null } | undefined)?.role ?? null;
  const sessionRoleStr =
    typeof sessionRoleRaw === "string" ? sessionRoleRaw : sessionRoleRaw != null ? String(sessionRoleRaw) : null;
  const canManageUsersFlag = canManageUsers(sessionRoleStr);

  const now = new Date();
  const nowIso = now.toISOString();
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
  const desiredTab = resolvedTab as "expired" | "trash" | "users";
  const activeTab: "expired" | "trash" | "users" =
    !canManageUsersFlag && desiredTab === "users" ? "expired" : desiredTab;

  const [deletedWords, deletedDefs, expired, languages, difficultyRows] = await Promise.all([
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
            difficulty: true,
            end_date: true,
            word_v: { select: { id: true, word_text: true } },
          },
        })
      : Promise.resolve([]),
    prisma.language.findMany({
      select: { code: true, name: true },
      orderBy: { id: "asc" },
    }),
    activeTab === "expired"
      ? prisma.opred_v.groupBy({
          by: ["difficulty"],
          where: {
            is_deleted: false,
            end_date: { lt: now },
            language: { is: { code: langCode } },
            word_v: { is_deleted: false, language: { is: { code: langCode } } },
          },
          _count: { _all: true },
          orderBy: { difficulty: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const difficulties = difficultyRows.map((r) => r.difficulty);

  let users: {
    id: string;
    login: string;
    email: string | null;
    role: Role | null;
    permissions: PermissionCode[];
    createdAtIso: string;
    isDeleted: boolean;
    createdByLabel: string | null;
  }[] = [];
  let roleOptions: Role[] = [];

  if (activeTab === "users") {
    // Ensure CHIEF_EDITOR_PLUS exists as a role row so it can be assigned from ADMIN
    if (sessionRoleStr === "ADMIN") {
      await prisma.roleDb.upsert({
        where: { code: "CHIEF_EDITOR_PLUS" as Role },
        update: {},
        create: { code: "CHIEF_EDITOR_PLUS" as Role },
      });
    }

    const [rawUsers, roleRows] = await Promise.all([
      prisma.user.findMany({
        orderBy: { id: "asc" },
        take: 200,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          is_deleted: true,
          created_by: true,
          role: { select: { code: true } },
        },
      }),
      prisma.roleDb.findMany({
        select: { code: true },
        orderBy: { code: "asc" },
      }),
    ]);
    const roles = Array.from(new Set(rawUsers.map((u) => u.role?.code).filter((r): r is Role => Boolean(r)))) as Role[];
    const rolePermEntries = await Promise.all(
      roles.map(async (role) => {
        const perms = await getRolePermissions(role);
        return [role, Array.from(perms)] as const;
      }),
    );
    const rolePermMap = new Map<Role, PermissionCode[]>(rolePermEntries);

    const creatorIds = Array.from(
      new Set(rawUsers.map((u) => u.created_by).filter((id): id is number => typeof id === "number")),
    );
    const creators =
      creatorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const creatorMap = new Map<number, { id: number; name: string | null; email: string | null }>(
      creators.map((c) => [c.id, c]),
    );

    users = rawUsers.map((u) => {
      const roleCode = u.role?.code ?? null;
      const creator = typeof u.created_by === "number" ? (creatorMap.get(u.created_by) ?? null) : null;
      const createdByLabel = creator != null ? creator.name || creator.email || `#${creator.id}` : null;
      return {
        id: String(u.id),
        login: u.name ?? "",
        email: u.email ?? null,
        role: roleCode,
        permissions: roleCode ? (rolePermMap.get(roleCode) ?? []) : [],
        createdAtIso: u.createdAt.toISOString(),
        isDeleted: u.is_deleted,
        createdByLabel,
      };
    });
    const allRoleCodes = roleRows.map((r) => r.code as Role);
    const priority: Role[] = ["CHIEF_EDITOR_PLUS", "CHIEF_EDITOR", "EDITOR", "USER", "MANAGER"];
    const order = new Map<Role, number>(priority.map((r, idx) => [r, idx]));
    const sortByPriority = (a: Role, b: Role) =>
      (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER);
    const availableRoles = resolveAllowedRoles(
      sessionRoleStr,
      Array.from(new Set<Role>([...allRoleCodes, ...baseRoles])),
    );
    roleOptions = availableRoles.sort(sortByPriority);
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
            {canManageUsersFlag && (
              <Button asChild variant={activeTab === "users" ? "default" : "outline"}>
                <Link href={{ query: { tab: "users", lang: langCode } }}>{t("users")}</Link>
              </Button>
            )}
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
                        difficulty: d.difficulty ?? 1,
                        endDateIso: d.end_date ? new Date(d.end_date).toISOString() : null,
                      }))}
                      difficulties={difficulties}
                      nowIso={nowIso}
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
                  <UsersAdminClient
                    users={users}
                    createUserAction={createUser}
                    toggleUserDeletionAction={toggleUserDeletion}
                    updateUserAction={updateUser}
                    roles={roleOptions}
                  />
                </CardContent>
              </Card>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
