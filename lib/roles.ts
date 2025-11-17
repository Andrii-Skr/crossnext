import type { Role } from "@prisma/client";

export type RoleLike = Role | string;

function normalizeRole(role: RoleLike | null | undefined): string | null {
  if (typeof role === "string") return role;
  if (role == null) return null;
  return String(role);
}

const PENDING_ROLES: readonly string[] = ["ADMIN", "CHIEF_EDITOR", "CHIEF_EDITOR_PLUS", "EDITOR"];
const ADMIN_ROLES: readonly string[] = ["ADMIN", "CHIEF_EDITOR", "CHIEF_EDITOR_PLUS"];
const USER_MANAGEMENT_ROLES: readonly string[] = ["ADMIN", "CHIEF_EDITOR_PLUS"];

export function canSeePending(role: RoleLike | null | undefined): boolean {
  const r = normalizeRole(role);
  return !!r && PENDING_ROLES.includes(r);
}

export function canSeeAdmin(role: RoleLike | null | undefined): boolean {
  const r = normalizeRole(role);
  return !!r && ADMIN_ROLES.includes(r);
}

export function canManageUsers(role: RoleLike | null | undefined): boolean {
  const r = normalizeRole(role);
  return !!r && USER_MANAGEMENT_ROLES.includes(r);
}

