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
import { canManageUsers } from "@/lib/roles";

export const dynamic = "force-dynamic";
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const isPasswordStrong = (value: string) => strongPasswordRegex.test(value);

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
  const session = await ensureAdminAccess();
  const sessionRoleRaw = (session?.user as { role?: Role | string | null } | undefined)?.role ?? null;
  const sessionRoleStr =
    typeof sessionRoleRaw === "string" ? sessionRoleRaw : sessionRoleRaw != null ? String(sessionRoleRaw) : null;
  const canManageUsersFlag = canManageUsers(sessionRoleStr);

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
  const desiredTab = resolvedTab as "expired" | "trash" | "users";
  const activeTab: "expired" | "trash" | "users" =
    !canManageUsersFlag && desiredTab === "users" ? "expired" : desiredTab;

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
    if (sessionRoleStr === "ADMIN") {
      // ADMIN can create any non-ADMIN roles (including CHIEF_EDITOR_PLUS)
      roleOptions = allRoleCodes.filter((r) => r !== "ADMIN").sort(sortByPriority);
    } else if (sessionRoleStr === "CHIEF_EDITOR_PLUS") {
      // CHIEF_EDITOR_PLUS can create CHIEF_EDITOR, EDITOR, USER
      roleOptions = allRoleCodes
        .filter((r) => r === "CHIEF_EDITOR" || r === "EDITOR" || r === "USER")
        .sort(sortByPriority);
    } else {
      roleOptions = [];
    }
  }

  async function createUser(formData: FormData) {
    "use server";
    const session = await ensureAdminAccess();
    const sessionUser = session?.user as { id?: string | null; role?: Role | string | null } | undefined;
    const sessionRole = sessionUser?.role ?? null;
    const roleStr = typeof sessionRole === "string" ? sessionRole : sessionRole != null ? String(sessionRole) : null;
    if (!canManageUsers(roleStr)) {
      const err = new Error("Forbidden");
      (err as Error & { status?: number }).status = 403;
      throw err;
    }
    const login = String(formData.get("login") ?? "").trim();
    const emailRaw = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const roleRaw = String(formData.get("role") ?? "").trim();

    if (!login || !password || !isPasswordStrong(password)) {
      throw new Error("Invalid payload");
    }

    const roleCode = (roleRaw || "USER") as Role;
    const creatorIdRaw = sessionUser?.id ?? null;
    const creatorId = creatorIdRaw != null ? Number(creatorIdRaw) : null;

    const roleRow = await prisma.roleDb.upsert({
      where: { code: roleCode },
      update: {},
      create: { code: roleCode },
    });

    const data: Parameters<typeof prisma.user.create>[0]["data"] = {
      name: login,
      passwordHash: await hash(password, 12),
      ...(emailRaw ? { email: emailRaw } : {}),
      role: {
        connect: { id: roleRow.id },
      },
      ...(creatorId != null && Number.isFinite(creatorId) ? { created_by: creatorId } : {}),
    };

    await prisma.user.create({ data });
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin`);
  }

  async function toggleUserDeletion(formData: FormData) {
    "use server";
    const session = await ensureAdminAccess();
    const roleRaw = (session?.user as { role?: Role | string | null } | undefined)?.role ?? null;
    const roleStr = typeof roleRaw === "string" ? roleRaw : roleRaw != null ? String(roleRaw) : null;
    if (!canManageUsers(roleStr)) {
      const err = new Error("Forbidden");
      (err as Error & { status?: number }).status = 403;
      throw err;
    }
    const id = formData.get("id");
    if (!id) return;
    const userId = Number(id);
    if (!Number.isFinite(userId)) return;

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { is_deleted: true },
    });
    if (!current) return;

    const nextDeleted = !current.is_deleted;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { is_deleted: nextDeleted },
      });
    });
    const locale = await getLocale();
    revalidatePath(`/${locale}/admin`);
  }

  async function updateUser(formData: FormData) {
    "use server";
    const session = await ensureAdminAccess();
    const sessionUser = session?.user as { role?: Role | string | null } | undefined;
    const roleRaw = sessionUser?.role ?? null;
    const sessionRole = typeof roleRaw === "string" ? roleRaw : roleRaw != null ? String(roleRaw) : null;
    if (!canManageUsers(sessionRole)) {
      const err = new Error("Forbidden");
      (err as Error & { status?: number }).status = 403;
      throw err;
    }

    const id = formData.get("id");
    if (!id) return;
    const userId = Number(id);
    if (!Number.isFinite(userId)) return;

    const passwordRaw = String(formData.get("password") ?? "");
    const roleRawInput = String(formData.get("role") ?? "").trim();

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { code: true } } },
    });
    if (!target) return;
    const currentRole = target.role?.code ?? null;
    if (currentRole === "ADMIN") {
      const err = new Error("Forbidden");
      (err as Error & { status?: number }).status = 403;
      throw err;
    }

    const roleRows = await prisma.roleDb.findMany({
      select: { code: true },
      orderBy: { code: "asc" },
    });
    const baseRoles: Role[] = ["ADMIN", "CHIEF_EDITOR_PLUS", "CHIEF_EDITOR", "EDITOR", "MANAGER", "USER"];
    const allRoleCodes = Array.from(new Set<Role>([...roleRows.map((r) => r.code as Role), ...baseRoles]));
    const allowedRoles =
      sessionRole === "ADMIN"
        ? allRoleCodes.filter((r) => r !== "ADMIN")
        : sessionRole === "CHIEF_EDITOR_PLUS"
          ? allRoleCodes.filter((r) => r === "CHIEF_EDITOR" || r === "EDITOR" || r === "USER")
          : [];
    const allowedSet = new Set<Role>(allowedRoles);

    const data: Parameters<typeof prisma.user.update>[0]["data"] = {};
    const password = passwordRaw.trim();
    if (password) {
      if (!isPasswordStrong(password)) {
        const err = new Error("Invalid payload");
        (err as Error & { status?: number }).status = 400;
        throw err;
      }
      data.passwordHash = await hash(password, 12);
    }

    const desiredRole = roleRawInput ? (roleRawInput as Role) : null;
    if (desiredRole && desiredRole !== currentRole) {
      if (!allowedSet.has(desiredRole)) {
        const err = new Error("Forbidden");
        (err as Error & { status?: number }).status = 403;
        throw err;
      }
      const roleRow = await prisma.roleDb.upsert({
        where: { code: desiredRole },
        update: {},
        create: { code: desiredRole },
      });
      data.role = { connect: { id: roleRow.id } };
    }

    if (Object.keys(data).length === 0) return;

    await prisma.user.update({
      where: { id: userId },
      data,
    });
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
