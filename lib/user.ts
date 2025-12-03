export function getNumericUserId(user: { id?: string | number | null } | null | undefined): number | null {
  if (!user) return null;
  const raw = user.id;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
