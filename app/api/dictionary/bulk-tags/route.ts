import type { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getNumericUserId } from "@/lib/user";
import type { DictionaryFilterInput } from "@/types/dictionary-bulk";
import { apiRoute } from "@/utils/appRoute";

const filterSchema = z.object({
  language: z.string().min(1),
  query: z.string().optional(),
  scope: z.enum(["word", "def", "both"]).optional(),
  tagNames: z.array(z.string()).optional(),
  searchMode: z.enum(["contains", "startsWith", "exact"]).optional(),
  lenFilterField: z.enum(["word", "def"]).optional(),
  lenMin: z.number().optional(),
  lenMax: z.number().optional(),
  difficultyMin: z.number().optional(),
  difficultyMax: z.number().optional(),
});

const postSchema = z
  .object({
    action: z.literal("applyTags"),
    tagIds: z.array(z.number().int().positive()).min(1),
    selectAllAcrossFilter: z.boolean().optional(),
    ids: z.array(z.string()).optional(),
    filter: filterSchema.optional(),
    excludeIds: z.array(z.string()).optional(),
  })
  .superRefine((val, ctx) => {
    const selectAll = val.selectAllAcrossFilter === true;
    if (selectAll && !val.filter) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "filter is required when selecting all" });
    }
    if (!selectAll && (!val.ids || val.ids.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ids are required when not selecting all" });
    }
  });

type PostBody = z.infer<typeof postSchema>;

function buildDefinitionWhere(filter: DictionaryFilterInput): Prisma.opred_vWhereInput {
  const language = filter.language.toLowerCase();
  const q = filter.query?.trim() ?? "";
  const textFilter = { contains: q, mode: "insensitive" as const };
  const tagNames = Array.from(new Set((filter.tagNames ?? []).map((s) => s.trim()).filter(Boolean)));
  const lenMin = typeof filter.lenMin === "number" ? filter.lenMin : undefined;
  const lenMax = typeof filter.lenMax === "number" ? filter.lenMax : undefined;
  const difficultyMin = typeof filter.difficultyMin === "number" ? filter.difficultyMin : undefined;
  const difficultyMax = typeof filter.difficultyMax === "number" ? filter.difficultyMax : undefined;
  const now = new Date();

  const wordConstraints: Prisma.word_vWhereInput = {
    is_deleted: false,
    language: { is: { code: language } },
    ...(filter.lenFilterField === "word" && (lenMin != null || lenMax != null)
      ? {
          length: {
            ...(lenMin != null ? { gte: lenMin } : {}),
            ...(lenMax != null ? { lte: lenMax } : {}),
          },
        }
      : {}),
    ...(q && (filter.scope === "word" || filter.scope === "both") ? { word_text: textFilter } : {}),
  };

  const where: Prisma.opred_vWhereInput = {
    is_deleted: false,
    OR: [{ end_date: null }, { end_date: { gte: now } }],
    language: { is: { code: language } },
    ...(q && (filter.scope === "def" || filter.scope === "both") ? { text_opr: textFilter } : {}),
    ...(filter.lenFilterField === "def" && (lenMin != null || lenMax != null)
      ? {
          length: {
            ...(lenMin != null ? { gte: lenMin } : {}),
            ...(lenMax != null ? { lte: lenMax } : {}),
          },
        }
      : {}),
    ...(difficultyMin != null || difficultyMax != null
      ? {
          difficulty: {
            ...(difficultyMin != null ? { gte: difficultyMin } : {}),
            ...(difficultyMax != null ? { lte: difficultyMax } : {}),
          },
        }
      : {}),
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
    word_v: { is: wordConstraints },
  };

  return where;
}

const postHandler = async (
  _req: NextRequest,
  body: PostBody,
  _params: Record<string, never>,
  user: Session["user"] | null,
) => {
  const selectAll = body.selectAllAcrossFilter === true;
  const tagIds = Array.from(new Set(body.tagIds));
  const updateById = getNumericUserId(user as { id?: string | number | null } | null);

  if (!selectAll) {
    const ids: bigint[] = [];
    for (const raw of Array.from(new Set(body.ids ?? []))) {
      try {
        ids.push(BigInt(raw));
      } catch {
        return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
      }
    }
    if (!ids.length) return NextResponse.json({ applied: 0 });
    await prisma.$transaction(async (tx) => {
      for (const tagId of tagIds) {
        await tx.opredTag.createMany({
          data: ids.map((opredId) => ({
            opredId,
            tagId,
            ...(updateById != null ? { addedBy: updateById } : {}),
          })),
          skipDuplicates: true,
        });
      }
    });
    return NextResponse.json({ applied: ids.length });
  }

  const excludeSet = new Set((body.excludeIds ?? []).map(String));
  const filter = body.filter as DictionaryFilterInput;
  const where = buildDefinitionWhere(filter);
  const batchSize = 500;
  let cursor: bigint | undefined;
  let applied = 0;
  const q = filter.query?.trim() ?? "";
  const scope = filter.scope;
  const searchMode =
    filter.searchMode === "startsWith" || filter.searchMode === "exact" ? filter.searchMode : "contains";
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const searchRegex =
    (searchMode === "startsWith" || searchMode === "exact") && q.length
      ? new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(q)}${searchMode === "exact" ? "([^\\p{L}\\p{N}]|$)" : ""}`, "iu")
      : null;
  const shouldCheckWord = scope === "word" || scope === "both";
  const shouldCheckDef = scope === "def" || scope === "both";
  const matchesSearch = (text: string) => {
    if (!searchRegex) return true;
    return searchRegex.test(text);
  };

  await prisma.$transaction(async (tx) => {
    while (true) {
      const rows = await tx.opred_v.findMany({
        where,
        select: { id: true, text_opr: true, word_v: { select: { word_text: true } } },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      const filteredRows = searchRegex
        ? rows.filter((r) => {
            const wordText = r.word_v?.word_text ?? "";
            const wordMatches = shouldCheckWord ? matchesSearch(wordText) : true;
            const defMatches = shouldCheckDef ? matchesSearch(r.text_opr) : true;
            return wordMatches && defMatches;
          })
        : rows;
      const targets = filteredRows.filter((r) => !excludeSet.has(String(r.id)));
      if (targets.length) {
        const data = targets.flatMap((row) =>
          tagIds.map((tagId) => ({
            opredId: row.id,
            tagId,
            ...(updateById != null ? { addedBy: updateById } : {}),
          })),
        );
        await tx.opredTag.createMany({ data, skipDuplicates: true });
        applied += targets.length;
      }
      if (rows.length < batchSize) break;
      cursor = rows[rows.length - 1]?.id;
    }
  });

  return NextResponse.json({ applied });
};

export const POST = apiRoute<PostBody>(postHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite, Permissions.TagsAdminAccess],
  schema: postSchema,
});
