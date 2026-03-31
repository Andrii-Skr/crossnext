import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { apiRoute } from "@/utils/appRoute";

const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;

function parseIntParam(
  value: string | null,
  { fallback, min, max }: { fallback: number; min: number; max: number },
): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseNowParam(value: string | null): Date {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

const getHandler = async (
  req: NextRequest,
  _body: unknown,
  _params: Record<string, never>,
  _user: Session["user"] | null,
) => {
  const { searchParams } = new URL(req.url);
  const langCode = (searchParams.get("lang") || "ru").trim().toLowerCase();
  const q = searchParams.get("q")?.trim() ?? "";
  const take = parseIntParam(searchParams.get("take"), { fallback: DEFAULT_TAKE, min: 1, max: MAX_TAKE });
  const offset = parseIntParam(searchParams.get("offset"), { fallback: 0, min: 0, max: Number.MAX_SAFE_INTEGER });
  const now = parseNowParam(searchParams.get("now"));
  const where = {
    is_deleted: false,
    end_date: { lt: now },
    language: { is: { code: langCode } },
    word_v: {
      is_deleted: false,
      language: { is: { code: langCode } },
      ...(q ? { word_text: { contains: q, mode: "insensitive" as const } } : {}),
    },
  } as const;

  const [rows, total] = await Promise.all([
    prisma.opred_v.findMany({
      where,
      orderBy: { end_date: "desc" },
      skip: offset,
      take: take + 1,
      select: {
        id: true,
        text_opr: true,
        difficulty: true,
        end_date: true,
        word_v: { select: { word_text: true } },
      },
    }),
    prisma.opred_v.count({ where }),
  ]);

  const hasMore = rows.length > take;
  const pageItems = rows.slice(0, take).map((row) => ({
    id: String(row.id),
    word: row.word_v?.word_text ?? "",
    text: row.text_opr ?? "",
    difficulty: row.difficulty ?? 1,
    endDateIso: row.end_date ? new Date(row.end_date).toISOString() : null,
  }));

  return NextResponse.json({
    items: pageItems,
    hasMore,
    total,
    nextOffset: hasMore ? offset + take : null,
  });
};

export const GET = apiRoute(getHandler, {
  requireAuth: true,
  permissions: [Permissions.AdminAccess],
});
