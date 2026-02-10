import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getNumericUserId } from "@/lib/user";
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

const postSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filter: filterSchema,
});

type PostBody = z.infer<typeof postSchema>;

const postHandler = async (
  _req: Request,
  body: PostBody,
  _params: Record<string, never>,
  user: Session["user"] | null,
) => {
  const name = body.name.trim();
  const filter = body.filter;
  const tagNames = Array.from(new Set((filter.tagNames ?? []).map((s) => s.trim()).filter(Boolean)));
  const excludeTagNames = Array.from(new Set((filter.excludeTagNames ?? []).map((s) => s.trim()).filter(Boolean)));
  const createdBy = getNumericUserId(user as { id?: string | number | null } | null);

  const created = await prisma.dictionaryFilterTemplate.create({
    data: {
      name,
      language: filter.language.toLowerCase(),
      query: filter.query?.trim() || null,
      scope: filter.scope ?? "word",
      searchMode: filter.searchMode ?? "contains",
      lenFilterField: filter.lenFilterField ?? null,
      lenMin: typeof filter.lenMin === "number" ? filter.lenMin : null,
      lenMax: typeof filter.lenMax === "number" ? filter.lenMax : null,
      difficultyMin: typeof filter.difficultyMin === "number" ? filter.difficultyMin : null,
      difficultyMax: typeof filter.difficultyMax === "number" ? filter.difficultyMax : null,
      tagNames,
      excludeTagNames,
      createdBy,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: created.id });
};

const getHandler = async (
  req: NextRequest,
  _body: unknown,
  _params: Record<string, never>,
  _user: Session["user"] | null,
) => {
  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang")?.trim().toLowerCase();

  const items = await prisma.dictionaryFilterTemplate.findMany({
    where: {
      is_deleted: false,
      ...(lang ? { language: lang } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      language: true,
      query: true,
      scope: true,
      searchMode: true,
      lenFilterField: true,
      lenMin: true,
      lenMax: true,
      difficultyMin: true,
      difficultyMax: true,
      tagNames: true,
      excludeTagNames: true,
    },
  });

  return NextResponse.json({ items });
};

export const GET = apiRoute(getHandler, { requireAuth: true });
export const POST = apiRoute<PostBody>(postHandler, { schema: postSchema, requireAuth: true });
