import type { Role } from "@prisma/client";

export function hasRole(userRole: Role | null | undefined, required: Role | Role[]) {
  if (!userRole) return false;
  const req = Array.isArray(required) ? required : [required];
  return req.includes(userRole);
}

export function requireRole<T extends { role?: Role | null }>(user: T | null | undefined, required: Role | Role[]) {
  if (!user || !hasRole(user.role ?? null, required)) {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}
