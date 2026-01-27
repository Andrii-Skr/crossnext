import type { Prisma } from "@prisma/client";

const SPACE_RE = /\s+/g;

export type ReplaceMap = Record<string, string>;

const RU_DEFAULT_MAP: ReplaceMap = { "\u0451": "\u0435", "\u0439": "\u0438" }; // ё->е, й->и

export function normalizeWordText(value: string): string {
  return value.trim().replace(SPACE_RE, "").toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractReplaceMap(value?: Prisma.JsonValue | null): ReplaceMap | null {
  if (!isPlainObject(value)) return null;
  const entries: ReplaceMap = {};
  for (const [key, val] of Object.entries(value)) {
    if (!key) continue;
    if (typeof val === "string") entries[key] = val;
  }
  return entries;
}

export function applyReplaceMap(value: string, map: ReplaceMap): string {
  let out = value;
  for (const [from, to] of Object.entries(map)) {
    if (!from) continue;
    out = out.split(from).join(to);
  }
  return out;
}

export function normalizeWordTextForLang(
  value: string,
  langCode?: string | null,
  replaceMap?: Prisma.JsonValue | null,
): string {
  const base = normalizeWordText(value);
  const map = extractReplaceMap(replaceMap);
  if (map !== null) return applyReplaceMap(base, map);
  if (langCode?.toLowerCase() === "ru") return applyReplaceMap(base, RU_DEFAULT_MAP);
  return base;
}
