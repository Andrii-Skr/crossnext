import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const filterSchema = z.object({
  language: z.string().min(1),
  query: z.string().optional(),
  scope: z.enum(["word", "def", "both"]).optional(),
  tagNames: z.array(z.string()).optional(),
  excludeTagNames: z.array(z.string()).optional(),
  searchMode: z.enum(["contains", "startsWith", "exact"]).optional(),
  lenFilterField: z.enum(["word", "def"]).optional(),
  lenMin: z.number().optional(),
  lenMax: z.number().optional(),
  difficultyMin: z.number().optional(),
  difficultyMax: z.number().optional(),
});

type FilterInput = z.infer<typeof filterSchema>;

type StatsResponse = {
  totalWords: number;
  totalDefs: number;
  difficultyCounts: Array<{ difficulty: number; count: number }>;
  tagCounts: Array<{ tagId: number; name: string; count: number }>;
  lengthCounts: Array<{ length: number; count: number }>;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const postHandler = async (
  _req: Request,
  filter: FilterInput,
  _params: Record<string, never>,
  _user: Session["user"] | null,
) => {
  const langCode = filter.language.toLowerCase();
  const q = filter.query?.trim() ?? "";
  const scope = filter.scope ?? "word";
  const tagNames = Array.from(new Set((filter.tagNames ?? []).map((s) => s.trim()).filter(Boolean)));
  const excludeTagNames = Array.from(new Set((filter.excludeTagNames ?? []).map((s) => s.trim()).filter(Boolean)));
  const searchMode =
    filter.searchMode === "startsWith" || filter.searchMode === "exact" ? filter.searchMode : "contains";
  const lenFilterField = filter.lenFilterField;
  const lenMin = typeof filter.lenMin === "number" ? filter.lenMin : undefined;
  const lenMax = typeof filter.lenMax === "number" ? filter.lenMax : undefined;
  const difficultyMin = typeof filter.difficultyMin === "number" ? filter.difficultyMin : undefined;
  const difficultyMax = typeof filter.difficultyMax === "number" ? filter.difficultyMax : undefined;
  const now = new Date();
  const textFilter = { contains: q, mode: "insensitive" as const };

  const whereLenWord =
    lenFilterField === "word" && (Number.isFinite(lenMin as number) || Number.isFinite(lenMax as number))
      ? {
          length: {
            ...(Number.isFinite(lenMin as number) ? { gte: lenMin as number } : {}),
            ...(Number.isFinite(lenMax as number) ? { lte: lenMax as number } : {}),
          },
        }
      : {};

  const opredSomeBase: Record<string, unknown> = {
    language: { is: { code: langCode } },
  };
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
  if (excludeTagNames.length) {
    opredSomeBase.NOT = {
      tags: {
        some: {
          tag: {
            OR: excludeTagNames.map((name) => ({
              name: { contains: name, mode: "insensitive" as const },
            })),
          },
        },
      },
    };
  }
  if (Number.isFinite(difficultyMin as number) || Number.isFinite(difficultyMax as number))
    opredSomeBase.difficulty = {
      ...(Number.isFinite(difficultyMin as number) ? { gte: difficultyMin as number } : {}),
      ...(Number.isFinite(difficultyMax as number) ? { lte: difficultyMax as number } : {}),
    };
  if (lenFilterField === "def" && (Number.isFinite(lenMin as number) || Number.isFinite(lenMax as number)))
    opredSomeBase.length = {
      ...(Number.isFinite(lenMin as number) ? { gte: lenMin as number } : {}),
      ...(Number.isFinite(lenMax as number) ? { lte: lenMax as number } : {}),
    };
  const opredSome =
    Object.keys(opredSomeBase).length > 0
      ? {
          ...opredSomeBase,
          OR: [{ end_date: null }, { end_date: { gte: now } }],
        }
      : opredSomeBase;
  const opredWithSearch =
    q && (scope === "def" || scope === "both")
      ? {
          ...opredSome,
          text_opr: textFilter,
        }
      : null;

  const baseWhere: Prisma.word_vWhereInput = {
    is_deleted: false,
    language: { is: { code: langCode } },
    ...whereLenWord,
    ...(Object.keys(opredSome).length > 0 ? { opred_v: { some: opredSome } } : {}),
  };

  const wordSearch = q && (scope === "word" || scope === "both") ? { word_text: textFilter } : undefined;
  const where: Prisma.word_vWhereInput =
    scope === "both" && wordSearch && opredWithSearch
      ? { ...baseWhere, OR: [wordSearch, { opred_v: { some: opredWithSearch } }] }
      : {
          ...baseWhere,
          ...(wordSearch ?? {}),
          ...(opredWithSearch && scope !== "both" ? { opred_v: { some: opredWithSearch } } : {}),
        };

  const includeOpredWhere: Prisma.opred_vWhereInput = {
    is_deleted: false,
    OR: [{ end_date: null }, { end_date: { gte: now } }],
    language: { is: { code: langCode } },
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
    ...(excludeTagNames.length
      ? {
          NOT: {
            tags: {
              some: {
                tag: {
                  OR: excludeTagNames.map((name) => ({
                    name: { contains: name, mode: "insensitive" as const },
                  })),
                },
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
    ...(Number.isFinite(difficultyMin as number) || Number.isFinite(difficultyMax as number)
      ? {
          difficulty: {
            ...(Number.isFinite(difficultyMin as number) ? { gte: difficultyMin as number } : {}),
            ...(Number.isFinite(difficultyMax as number) ? { lte: difficultyMax as number } : {}),
          },
        }
      : {}),
    ...(q && scope === "def" ? { text_opr: textFilter } : {}),
  };

  const searchRegex =
    (searchMode === "startsWith" || searchMode === "exact") && q.length
      ? new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(q)}${searchMode === "exact" ? "([^\\p{L}\\p{N}]|$)" : ""}`, "iu")
      : null;

  const rows = await prisma.word_v.findMany({
    where,
    select: {
      id: true,
      word_text: true,
      length: true,
      opred_v: {
        where: includeOpredWhere,
        select: {
          id: true,
          text_opr: true,
          difficulty: true,
          length: true,
          tags: { select: { tag: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  type SearchableWord = {
    id: bigint | string;
    word_text: string;
    length: number;
    opred_v: Array<{
      id: bigint | string;
      text_opr: string;
      difficulty: number | null;
      length: number | null;
      tags: { tag: { id: number; name: string } }[];
    }>;
  };

  const matchesSearch = (text: string) => {
    if (!searchRegex) return true;
    return searchRegex.test(text);
  };

  const filterExact = <T extends SearchableWord>(items: T[]) => {
    if (!searchRegex) return items;
    return items
      .map((w) => {
        const defMatches = w.opred_v.filter((d) => matchesSearch(d.text_opr));
        const wordMatches = matchesSearch(w.word_text);
        if (scope === "word" && wordMatches) return { ...w, opred_v: defMatches };
        if (scope === "def" && defMatches.length) return { ...w, opred_v: defMatches };
        if (scope === "both" && (wordMatches || defMatches.length))
          return { ...w, opred_v: defMatches.length ? defMatches : w.opred_v };
        return null;
      })
      .filter((w): w is NonNullable<typeof w> => !!w);
  };

  const filterStartsWith = <T extends SearchableWord>(items: T[]) => {
    if (!searchRegex) return items;
    return items
      .map((w) => {
        const defMatches = w.opred_v.filter((d) => matchesSearch(d.text_opr));
        const wordMatches = matchesSearch(w.word_text);
        if (scope === "word") return wordMatches ? w : null;
        if (scope === "def") return defMatches.length ? { ...w, opred_v: defMatches } : null;
        if (scope === "both") return wordMatches || defMatches.length ? w : null;
        return null;
      })
      .filter((w): w is NonNullable<typeof w> => !!w);
  };

  const filterBySearch = <T extends SearchableWord>(items: T[]) => {
    if (searchMode === "exact") return filterExact(items);
    if (searchMode === "startsWith") return filterStartsWith(items);
    return items;
  };

  const filteredRows = searchRegex ? filterBySearch(rows as SearchableWord[]) : (rows as SearchableWord[]);

  let totalDefs = 0;
  const difficultyCounts = new Map<number, number>();
  const tagCounts = new Map<number, { id: number; name: string; wordIds: Set<string> }>();
  const lengthCounts = new Map<number, number>();

  for (const word of filteredRows) {
    totalDefs += word.opred_v.length;
    if (Number.isFinite(word.length)) {
      lengthCounts.set(word.length, (lengthCounts.get(word.length) ?? 0) + 1);
    }
    const wordId = String(word.id);
    for (const def of word.opred_v) {
      if (typeof def.difficulty === "number") {
        difficultyCounts.set(def.difficulty, (difficultyCounts.get(def.difficulty) ?? 0) + 1);
      }
      for (const link of def.tags ?? []) {
        const tag = link.tag;
        if (!tag) continue;
        const entry = tagCounts.get(tag.id) ?? { id: tag.id, name: tag.name, wordIds: new Set<string>() };
        entry.wordIds.add(wordId);
        tagCounts.set(tag.id, entry);
      }
    }
  }

  const response: StatsResponse = {
    totalWords: filteredRows.length,
    totalDefs,
    difficultyCounts: Array.from(difficultyCounts.entries())
      .map(([difficulty, count]) => ({ difficulty, count }))
      .sort((a, b) => a.difficulty - b.difficulty),
    tagCounts: Array.from(tagCounts.values())
      .map((tag) => ({ tagId: tag.id, name: tag.name, count: tag.wordIds.size }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    lengthCounts: Array.from(lengthCounts.entries())
      .map(([length, count]) => ({ length, count }))
      .sort((a, b) => a.length - b.length),
  };

  return NextResponse.json(response);
};

export const POST = apiRoute<FilterInput>(postHandler, { schema: filterSchema, requireAuth: true });
