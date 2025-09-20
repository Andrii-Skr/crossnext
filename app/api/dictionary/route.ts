import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const getHandler = async (
  req: NextRequest,
  _body: unknown,
  _params: Record<string, never>,
  _user: Session["user"] | null,
) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const scope = searchParams.get("scope") || "both"; // word|def|both
  const tagNames = Array.from(
    new Set(
      [
        ...searchParams.getAll("tags").map((s) => s.trim()),
        searchParams.get("tag")?.trim() || "",
      ].filter(Boolean),
    ),
  );
  const modeParam = searchParams.get("mode");
  const searchMode: "contains" | "startsWith" =
    modeParam === "startsWith" ? "startsWith" : "contains";
  const lenField = searchParams.get("lenField") as "word" | "def" | "" | null;
  const lenDirRaw = searchParams.get("lenDir");
  const lenDir: "asc" | "desc" | undefined =
    lenDirRaw === "asc" || lenDirRaw === "desc" ? lenDirRaw : undefined;
  const lenFilterField = searchParams.get("lenFilterField") as
    | "word"
    | "def"
    | ""
    | null;
  const lenMinRaw = searchParams.get("lenMin");
  const lenMaxRaw = searchParams.get("lenMax");
  const lenMin =
    lenMinRaw && lenMinRaw !== "" ? Number.parseInt(lenMinRaw, 10) : undefined;
  const lenMax =
    lenMaxRaw && lenMaxRaw !== "" ? Number.parseInt(lenMaxRaw, 10) : undefined;
  const diffRaw = searchParams.get("difficulty");
  const difficulty =
    diffRaw && diffRaw !== "" ? Number.parseInt(diffRaw, 10) : undefined;
  const take = Math.min(Number(searchParams.get("take") || 20), 50);
  const cursorParam = searchParams.get("cursor");
  const cursor = cursorParam ? BigInt(cursorParam) : undefined;
  const now = new Date();

  const textFilter =
    searchMode === "startsWith"
      ? { startsWith: q, mode: "insensitive" as const }
      : { contains: q, mode: "insensitive" as const };
  const whereWord =
    q && (scope === "word" || scope === "both")
      ? { word_text: textFilter }
      : {};

  const whereLenWord =
    lenFilterField === "word" && (Number.isFinite(lenMin as number) || Number.isFinite(lenMax as number))
      ? {
          length: {
            ...(Number.isFinite(lenMin as number) ? { gte: lenMin as number } : {}),
            ...(Number.isFinite(lenMax as number) ? { lte: lenMax as number } : {}),
          },
        }
      : {};

  // Combine definition-level filters (text, tag, def length) so a single definition must satisfy all
  const opredSomeBase: Record<string, unknown> = {};
  if (q && (scope === "def" || scope === "both"))
    opredSomeBase.text_opr = textFilter;
  if (tagNames.length)
    opredSomeBase.tags = {
      some: {
        tag: {
          OR: tagNames.map((name) => ({
            name: { contains: name, mode: "insensitive" as const },
          })),
        },
      },
    };
  if (Number.isFinite(difficulty as number))
    opredSomeBase.difficulty = { equals: difficulty as number };
  if (
    lenFilterField === "def" &&
    (Number.isFinite(lenMin as number) || Number.isFinite(lenMax as number))
  )
    opredSomeBase.length = {
      ...(Number.isFinite(lenMin as number) ? { gte: lenMin as number } : {}),
      ...(Number.isFinite(lenMax as number) ? { lte: lenMax as number } : {}),
    };
  // Only include active (not expired) definitions when def-level filters are used
  const opredSome =
    Object.keys(opredSomeBase).length > 0
      ? { ...opredSomeBase, OR: [{ end_date: null }, { end_date: { gte: now } }] }
      : opredSomeBase;
  const whereOpredCombined =
    Object.keys(opredSomeBase).length > 0 ? { opred_v: { some: opredSome } } : {};

  const where = {
    is_deleted: false,
    ...whereWord,
    ...whereLenWord,
    ...whereOpredCombined,
  };

  // Build include-level filter for definitions so that we only return matching ones
  const includeOpredWhere = {
    is_deleted: false,
    OR: [{ end_date: null }, { end_date: { gte: now } }],
    ...(tagNames.length
      ? {
          tags: {
            some: {
              tag: {
                OR: tagNames.map((name) => ({
                  name: { contains: name, mode: "insensitive" as const },
                })),
              },
            },
          },
        }
      : {}),
    ...(lenFilterField === "def" && (Number.isFinite(lenMin as number) || Number.isFinite(lenMax as number))
      ? {
          length: {
            ...(Number.isFinite(lenMin as number) ? { gte: lenMin as number } : {}),
            ...(Number.isFinite(lenMax as number) ? { lte: lenMax as number } : {}),
          },
        }
      : {}),
    ...(Number.isFinite(difficulty as number)
      ? { difficulty: { equals: difficulty as number } }
      : {}),
    ...(q && (scope === "def" || scope === "both")
      ? { text_opr: textFilter }
      : {}),
  };

  const items = await prisma.word_v.findMany({
    where,
    orderBy:
      lenField === "word" && (lenDir === "asc" || lenDir === "desc")
        ? [{ length: lenDir }, { id: "asc" }]
        : { id: "asc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      opred_v: {
        where: includeOpredWhere,
        select: {
          id: true,
          text_opr: true,
          end_date: true,
          tags: { select: { tag: { select: { id: true, name: true } } } },
        },
        orderBy:
          lenField === "def" && (lenDir === "asc" || lenDir === "desc")
            ? [{ length: lenDir }, { id: "asc" }]
            : { id: "asc" },
      },
    },
  });

  const total = await prisma.word_v.count({ where });
  const totalDefs = await prisma.opred_v.count({
    where: {
      ...includeOpredWhere,
      word_v: { is: where },
    },
  });

  const hasMore = items.length > take;
  const data = items.slice(0, take);
  const nextCursor = hasMore ? String(data[data.length - 1].id) : null;

  // Convert BigInt ids to string for JSON safety
  const safe = data.map((w) => ({
    id: String(w.id),
    word_text: w.word_text,
    opred_v: w.opred_v.map((d) => ({
      id: String(d.id),
      text_opr: d.text_opr,
      end_date: d.end_date ? d.end_date.toISOString() : null,
      tags: d.tags.map((t) => ({ tag: { id: t.tag.id, name: t.tag.name } })),
    })),
  }));

  return NextResponse.json({ items: safe, nextCursor, total, totalDefs });
};

export const GET = apiRoute(getHandler);
