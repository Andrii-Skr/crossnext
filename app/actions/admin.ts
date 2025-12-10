"use server";

import { Prisma, type Role } from "@prisma/client";
import { hash } from "bcrypt";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { getLocale } from "next-intl/server";
import { authOptions } from "@/auth";
import { baseRoles, resolveAllowedRoles } from "@/lib/admin/roles";
import { Permissions, requirePermissionAsync } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/roles";
import { getNumericUserId } from "@/lib/user";

const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const isPasswordStrong = (value: string) => strongPasswordRegex.test(value);

export async function ensureAdminAccess() {
  const session = await getServerSession(authOptions);
  await requirePermissionAsync(session?.user ?? null, Permissions.AdminAccess);
  return session;
}

export async function createUserAction(formData: FormData) {
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

  const roleRows = await prisma.roleDb.findMany({
    select: { code: true },
    orderBy: { code: "asc" },
  });
  const allRoleCodes = Array.from(new Set<Role>([...roleRows.map((r) => r.code as Role), ...baseRoles]));
  const allowedRoles = resolveAllowedRoles(roleStr, allRoleCodes);

  const roleCode = ((roleRaw || "USER") as Role) ?? "USER";
  if (!allowedRoles.includes(roleCode)) {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

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

  try {
    await prisma.user.create({ data });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const err = new Error("Duplicate user");
      (err as Error & { status?: number }).status = 409;
      throw err;
    }
    throw e;
  }
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin`);
}

export async function toggleUserDeletionAction(formData: FormData) {
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
    select: { is_deleted: true, role: { select: { code: true } } },
  });
  if (!current) return;

  const targetRole = current.role?.code ?? null;
  if (targetRole === "ADMIN") {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

  const roleRows = await prisma.roleDb.findMany({
    select: { code: true },
    orderBy: { code: "asc" },
  });
  const allRoleCodes = Array.from(new Set<Role>([...roleRows.map((r) => r.code as Role), ...baseRoles]));
  const allowedRoles = resolveAllowedRoles(roleStr, allRoleCodes);
  if (targetRole && !allowedRoles.includes(targetRole)) {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

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

export async function updateUserAction(formData: FormData) {
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
  const allRoleCodes = Array.from(new Set<Role>([...roleRows.map((r) => r.code as Role), ...baseRoles]));
  const allowedRoles = resolveAllowedRoles(sessionRole, allRoleCodes);
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

export async function restoreWordAction(formData: FormData) {
  const session = await ensureAdminAccess();
  const updateById = getNumericUserId(session?.user as { id?: string | number | null } | null);
  const id = formData.get("id");
  if (!id) return;
  const wordId = BigInt(String(id));
  await prisma.$transaction(async (tx) => {
    await tx.word_v.update({
      where: { id: wordId },
      data: {
        is_deleted: false,
        ...(updateById != null ? { updateBy: updateById } : {}),
      },
    });
    await tx.opred_v.updateMany({
      where: { word_id: wordId },
      data: {
        is_deleted: false,
        ...(updateById != null ? { updateBy: updateById } : {}),
      },
    });
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin`);
}

export async function restoreDefAction(formData: FormData) {
  const session = await ensureAdminAccess();
  const updateById = getNumericUserId(session?.user as { id?: string | number | null } | null);
  const id = formData.get("id");
  if (!id) return;
  const defId = BigInt(String(id));
  await prisma.opred_v.update({
    where: { id: defId },
    data: {
      is_deleted: false,
      ...(updateById != null ? { updateBy: updateById } : {}),
    },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin`);
}

export async function extendDefAction(formData: FormData) {
  const session = await ensureAdminAccess();
  const updateById = getNumericUserId(session?.user as { id?: string | number | null } | null);
  const id = formData.get("id");
  if (!id) return;
  const defId = BigInt(String(id));
  const endStr = String(formData.get("end_date") || "");
  const difficultyRaw = formData.get("difficulty");
  const difficultyParsed = Number.parseInt(String(difficultyRaw ?? ""), 10);
  const dt = endStr ? new Date(endStr) : null;
  const data: Parameters<typeof prisma.opred_v.update>[0]["data"] = {
    end_date: dt,
    ...(updateById != null ? { updateBy: updateById } : {}),
  };
  if (Number.isFinite(difficultyParsed)) {
    data.difficulty = Math.max(0, Math.trunc(difficultyParsed));
  }
  await prisma.opred_v.update({
    where: { id: defId },
    data,
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin`);
}

export async function extendDefsBulkAction(formData: FormData) {
  const session = await ensureAdminAccess();
  const updateById = getNumericUserId(session?.user as { id?: string | number | null } | null);
  const idsRaw = String(formData.get("ids") || "");
  const endStr = String(formData.get("end_date") || "");
  const difficultyRaw = formData.get("difficulty");
  const difficultyParsed = Number.parseInt(String(difficultyRaw ?? ""), 10);
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s));
  const dt = endStr ? new Date(endStr) : null;
  if (ids.length > 0) {
    const data: Parameters<typeof prisma.opred_v.updateMany>[0]["data"] = {
      end_date: dt,
      ...(updateById != null ? { updateBy: updateById } : {}),
    };
    if (Number.isFinite(difficultyParsed)) {
      data.difficulty = Math.max(0, Math.trunc(difficultyParsed));
    }
    await prisma.opred_v.updateMany({
      where: { id: { in: ids } },
      data,
    });
  }
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin`);
}

export async function softDeleteDefAction(formData: FormData) {
  const session = await ensureAdminAccess();
  const updateById = getNumericUserId(session?.user as { id?: string | number | null } | null);
  const id = formData.get("id");
  if (!id) return;
  const defId = BigInt(String(id));
  await prisma.opred_v.update({
    where: { id: defId },
    data: {
      is_deleted: true,
      ...(updateById != null ? { updateBy: updateById } : {}),
    },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin`);
}

export async function hardDeleteDefsBulkAction(formData: FormData) {
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

export async function hardDeleteWordsBulkAction(formData: FormData) {
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
