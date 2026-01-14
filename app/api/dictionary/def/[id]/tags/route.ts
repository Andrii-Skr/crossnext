import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getNumericUserId } from "@/lib/user";
import { apiRoute } from "@/utils/appRoute";

const postSchema = z.object({ tagId: z.number().int().positive() });
type PostBody = z.infer<typeof postSchema>;

const getHandler = async (_req: NextRequest, _body: unknown, params: { id: string }, _user: Session["user"] | null) => {
  let opredId: bigint;
  try {
    opredId = BigInt(params.id);
  } catch {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const row = await prisma.opred_v.findUnique({
    where: { id: opredId },
    select: {
      difficulty: true,
      tags: {
        select: { tag: { select: { id: true, name: true } } },
        orderBy: { tagId: "asc" },
      },
    },
  });
  const items = row?.tags.map((r) => r.tag) ?? [];
  return NextResponse.json({ items, difficulty: row?.difficulty ?? 1 });
};

const postHandler = async (_req: NextRequest, body: PostBody, params: { id: string }, user: Session["user"] | null) => {
  let opredId: bigint;
  try {
    opredId = BigInt(params.id);
  } catch {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const addedById = getNumericUserId(user as { id?: string | number | null } | null);
  await prisma.$transaction(async (tx) => {
    await tx.opredTag.createMany({
      data: [
        {
          opredId,
          tagId: body.tagId,
          ...(addedById != null ? { addedBy: addedById } : {}),
        },
      ],
      skipDuplicates: true,
    });
  });
  return NextResponse.json({ ok: true });
};

const deleteHandler = async (
  req: NextRequest,
  _body: unknown,
  params: { id: string },
  _user: Session["user"] | null,
) => {
  let opredId: bigint;
  try {
    opredId = BigInt(params.id);
  } catch {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const tagId = Number(new URL(req.url).searchParams.get("tagId"));
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return NextResponse.json({ error: "Invalid tagId" }, { status: 400 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.opredTag.deleteMany({ where: { opredId, tagId } });
  });
  return NextResponse.json({ ok: true });
};

export const GET = apiRoute(getHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
});
export const POST = apiRoute<PostBody, { id: string }>(postHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
  schema: postSchema,
});
export const DELETE = apiRoute(deleteHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
});
