import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

type RoleLike = Role | string;

// ----- Roles -----
export function hasRole(userRole: RoleLike | null | undefined, required: RoleLike | RoleLike[]) {
  if (!userRole) return false;
  const userStr = String(userRole);
  const req = Array.isArray(required) ? required : [required];
  return req.some((r) => String(r) === userStr);
}

export function requireRole<T extends { role?: RoleLike | null }>(
  user: T | null | undefined,
  required: RoleLike | RoleLike[],
) {
  if (!user || !hasRole(user.role ?? null, required)) {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}

// ----- Permissions -----
export const Permissions = {
  AdminAccess: "admin:access",
  PendingReview: "pending:review",
  DictionaryWrite: "dictionary:write",
  TagsWrite: "tags:write",
} as const;

export type PermissionCode = (typeof Permissions)[keyof typeof Permissions];

// Fallback mapping to keep app working before migrations are applied
const fallbackRolePermissions: Record<string, ReadonlySet<PermissionCode>> = {
  ADMIN: new Set<PermissionCode>([
    Permissions.AdminAccess,
    Permissions.PendingReview,
    Permissions.DictionaryWrite,
    Permissions.TagsWrite,
  ]),
  CHIEF_EDITOR: new Set<PermissionCode>([
    Permissions.AdminAccess,
    Permissions.PendingReview,
    Permissions.DictionaryWrite,
    Permissions.TagsWrite,
  ]),
  EDITOR: new Set<PermissionCode>([Permissions.DictionaryWrite, Permissions.TagsWrite]),
  MANAGER: new Set<PermissionCode>([Permissions.PendingReview]),
  USER: new Set<PermissionCode>([]),
};

const PERM_CACHE = new Map<string, ReadonlySet<PermissionCode>>();

async function seedRolePermissionsFromFallback(key: string) {
  const fallback = fallbackRolePermissions[key];
  if (!fallback || fallback.size === 0) return;

  const allCodes = Object.values(Permissions);

  await prisma.$transaction(async (tx) => {
    // Ensure all permissions exist (descriptions are optional in schema)
    for (const code of allCodes) {
      await tx.permission.upsert({
        where: { code },
        update: {},
        create: { code },
      });
    }

    const codesForRole = Array.from(fallback);
    const permRows = await tx.permission.findMany({
      where: { code: { in: codesForRole } },
      select: { id: true, code: true },
    });

    if (permRows.length === 0) return;

    await tx.rolePermission.createMany({
      data: permRows.map((row) => ({
        role: key as Role,
        permissionId: row.id,
      })),
      skipDuplicates: true,
    });
  });
}

export async function getRolePermissions(role: RoleLike | null | undefined): Promise<ReadonlySet<PermissionCode>> {
  if (!role) return new Set();
  const key = String(role);
  const cached = PERM_CACHE.get(key);
  if (cached) return cached;
  try {
    const query = async () =>
      prisma.$queryRawUnsafe<{ code: string }[]>(
      'SELECT p.code AS code FROM role_permissions rp JOIN permissions p ON p.id = rp."permissionId" WHERE rp.role = $1::"Role"',
      role,
    );
    let rows = await query();

    if (!rows.length) {
      await seedRolePermissionsFromFallback(key);
      rows = await query();
    }

    if (!rows.length) {
      const fallback = fallbackRolePermissions[key] ?? new Set<PermissionCode>();
      PERM_CACHE.set(key, fallback);
      return fallback;
    }

    const set = new Set<PermissionCode>(rows.map((r) => r.code as PermissionCode));
    PERM_CACHE.set(key, set);
    return set;
  } catch {
    // Likely tables not migrated yet; use fallback
    const fallback = fallbackRolePermissions[key] ?? new Set<PermissionCode>();
    PERM_CACHE.set(key, fallback);
    return fallback;
  }
}

export async function hasPermissionAsync(
  userRole: RoleLike | null | undefined,
  required: PermissionCode | PermissionCode[],
) {
  if (!userRole) return false;
  const granted = await getRolePermissions(userRole);
  const req = Array.isArray(required) ? required : [required];
  return req.every((p) => granted.has(p));
}

export async function requirePermissionAsync<T extends { role?: RoleLike | null }>(
  user: T | null | undefined,
  required: PermissionCode | PermissionCode[],
) {
  if (!user || !(await hasPermissionAsync(user.role ?? null, required))) {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}
