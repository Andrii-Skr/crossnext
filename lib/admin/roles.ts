import type { Role } from "@prisma/client";

export const baseRoles: Role[] = ["ADMIN", "CHIEF_EDITOR_PLUS", "CHIEF_EDITOR", "EDITOR", "MANAGER", "USER"];

export const resolveAllowedRoles = (currentRole: Role | string | null, roleCodes: Role[]): Role[] => {
  const normalized = typeof currentRole === "string" ? currentRole : currentRole != null ? String(currentRole) : null;
  if (normalized === "ADMIN") {
    return roleCodes.filter((r) => r !== "ADMIN");
  }
  if (normalized === "CHIEF_EDITOR_PLUS") {
    return roleCodes.filter((r) => r === "CHIEF_EDITOR" || r === "EDITOR" || r === "USER");
  }
  return [];
};
