import type { Role } from "@prisma/client";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  addTagToTagsDefinitionsAction,
  createUserAction as createUser,
  deleteEmptyTagsAction,
  deleteTagAction,
  ensureAdminAccess,
  extendDefAction as extendDef,
  extendDefsBulkAction as extendDefsBulk,
  hardDeleteDefsBulkAction as hardDeleteDefsBulk,
  hardDeleteWordsBulkAction as hardDeleteWordsBulk,
  mergeTagAction,
  removeDefinitionFromTagAction,
  restoreDefAction as restoreDef,
  restoreWordAction as restoreWord,
  softDeleteDefAction as softDeleteDef,
  toggleUserDeletionAction as toggleUserDeletion,
  updateUserAction as updateUser,
} from "@/app/actions/admin";
import { AdminLangFilter } from "@/components/admin/AdminLangFilter";
import { AdminStatsClient } from "@/components/admin/AdminStatsClient";
import { AdminTabsNav } from "@/components/admin/AdminTabsNav";
import { DeletedDefinitionsClient } from "@/components/admin/DeletedDefinitionsClient";
import { DeletedWordsClient } from "@/components/admin/DeletedWordsClient";
import { ExpiredDefinitionsClient } from "@/components/admin/ExpiredDefinitionsClient";
import { TagsAdminClient } from "@/components/admin/TagsAdminClient";
import { UsersAdminClient } from "@/components/admin/UsersAdminClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { baseRoles, resolveAllowedRoles } from "@/lib/admin/roles";
import { getAdminStats } from "@/lib/admin/stats";
import { getRolePermissions, type PermissionCode, Permissions } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/roles";
import { getSearchParamValue, type SearchParamsInput } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export default async function AdminPanelPage({
  searchParams,
}: {
  // Next.js dynamic route APIs are async; accept Promise and await it
  searchParams: Promise<SearchParamsInput>;
}) {
  const t = await getTranslations();
  const session = await ensureAdminAccess();
  const sessionRoleRaw = (session?.user as { role?: Role | string | null } | undefined)?.role ?? null;
  const sessionRoleStr =
    typeof sessionRoleRaw === "string" ? sessionRoleRaw : sessionRoleRaw != null ? String(sessionRoleRaw) : null;
  const canManageUsersFlag = canManageUsers(sessionRoleStr);
  const sessionPermissions = await getRolePermissions(sessionRoleStr);
  const canAccessTags = sessionPermissions.has(Permissions.TagsAdminAccess);
  const canAccessStats = sessionPermissions.has(Permissions.StatsAdmin);

  const now = new Date();
  const nowIso = now.toISOString();
  const sp = await searchParams;
  const statsPeriodOptions = [3, 6, 12, 24];
  const statsMonthsBackRaw = getSearchParamValue(sp, "statsMonths");
  const statsMonthsBackParsed = statsMonthsBackRaw ? Number.parseInt(statsMonthsBackRaw, 10) : Number.NaN;
  const statsMonthsBack = statsPeriodOptions.includes(statsMonthsBackParsed) ? statsMonthsBackParsed : 12;
  const tabParam = getSearchParamValue(sp, "tab");
  const langParamRaw = getSearchParamValue(sp, "lang");
  const langCode = (langParamRaw || "ru").toLowerCase();
  const tagFilterRaw = getSearchParamValue(sp, "tag") ?? "";
  const tagFilter = tagFilterRaw.trim();
  const cookieStore = await cookies();
  const cookieTabRaw = cookieStore.get("adminTab")?.value;
  const cookieTab =
    cookieTabRaw === "expired" ||
    cookieTabRaw === "trash" ||
    cookieTabRaw === "users" ||
    cookieTabRaw === "tags" ||
    cookieTabRaw === "stats"
      ? cookieTabRaw
      : undefined;
  const allowedTabs = new Set<"expired" | "trash" | "users" | "tags" | "stats">(["expired", "trash"]);
  if (canAccessStats) allowedTabs.add("stats");
  if (canAccessTags) allowedTabs.add("tags");
  if (canManageUsersFlag) allowedTabs.add("users");
  const resolvedTab =
    tabParam === "expired" ||
    tabParam === "trash" ||
    tabParam === "users" ||
    tabParam === "tags" ||
    tabParam === "stats"
      ? tabParam
      : (cookieTab ?? "expired");
  const desiredTab = resolvedTab as "expired" | "trash" | "users" | "tags" | "stats";
  const activeTab: "expired" | "trash" | "users" | "tags" | "stats" = allowedTabs.has(desiredTab)
    ? desiredTab
    : "expired";

  const [deletedWords, deletedDefs, expired, languages, tagLinks, difficultyRows] = await Promise.all([
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
      select: { id: true, code: true, name: true },
      orderBy: { id: "asc" },
    }),
    activeTab === "tags"
      ? prisma.tag.findMany({
          orderBy: { name: "asc" },
          include: {
            opredLinks: {
              where: {
                opred: {
                  is_deleted: false,
                  language: { is: { code: langCode } },
                  word_v: { is_deleted: false, language: { is: { code: langCode } } },
                  OR: [{ end_date: null }, { end_date: { gte: now } }],
                },
              },
              select: {
                opred: {
                  select: {
                    id: true,
                    text_opr: true,
                    word_v: { select: { id: true, word_text: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    activeTab === "expired"
      ? prisma.difficulty.findMany({
          select: { id: true },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const difficulties = activeTab === "expired" ? difficultyRows.map((row) => row.id) : [];

  const tagItems: {
    id: number;
    name: string;
    definitions: { id: string; word: string; text: string }[];
    count: number;
  }[] =
    activeTab === "tags"
      ? tagLinks
          .map((tag) => {
            const defs = tag.opredLinks
              .map((link) => link.opred)
              .filter((opred): opred is NonNullable<typeof opred> => Boolean(opred))
              .map((opred) => ({
                id: typeof opred.id === "bigint" ? opred.id.toString() : String(opred.id),
                word: opred.word_v?.word_text ?? "",
                text: opred.text_opr ?? "",
              }))
              .filter((d) => d.id);
            return {
              id: tag.id,
              name: tag.name,
              definitions: defs.sort((a, b) => a.word.localeCompare(b.word) || a.text.localeCompare(b.text)),
              count: defs.length,
            };
          })
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      : [];
  const tagOptions =
    activeTab === "tags"
      ? tagLinks.map((t) => ({
          id: t.id,
          name: t.name,
        }))
      : [];
  const emptyTagsCount = activeTab === "tags" ? tagItems.filter((t) => t.count === 0).length : 0;

  const langRow = languages.find((l) => l.code.toLowerCase() === langCode) ?? null;
  const langId = langRow?.id ?? null;
  const stats = activeTab === "stats" ? await getAdminStats({ langId, monthsBack: statsMonthsBack, now }) : [];

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
          <AdminTabsNav
            activeTab={activeTab}
            langCode={langCode}
            tagFilter={tagFilter || undefined}
            canAccessTags={canAccessTags}
            canManageUsers={canManageUsersFlag}
            canAccessStats={canAccessStats}
            labels={{
              expired: t("expired"),
              trash: t("deleted"),
              stats: t("statistics"),
              tags: t("tags"),
              users: t("users"),
            }}
          />
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

          {activeTab === "stats" && (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle>{t("statistics")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <AdminStatsClient months={stats} monthsBack={statsMonthsBack} periodOptions={statsPeriodOptions} />
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === "tags" && (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle>{t("tags")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {tagItems.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t("noData")}</div>
                  ) : (
                    <TagsAdminClient
                      items={tagItems}
                      allTags={tagOptions}
                      initialFilter={tagFilter}
                      mergeAction={mergeTagAction}
                      deleteAction={deleteTagAction}
                      removeDefinitionAction={removeDefinitionFromTagAction}
                      addTagToTagsAction={addTagToTagsDefinitionsAction}
                      deleteEmptyTagsAction={deleteEmptyTagsAction}
                      emptyTagsCount={emptyTagsCount}
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
