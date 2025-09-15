import { Role } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const postSchema = z.object({ tagId: z.number().int().positive() });
type PostBody = z.infer<typeof postSchema>;

const getHandler = async (
  _req: NextRequest,
  _body: unknown,
  params: { id: string },
  _user: Session["user"] | null,
) => {
  const opredId = BigInt(params.id);
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

const postHandler = async (
  _req: NextRequest,
  body: PostBody,
  params: { id: string },
  _user: Session["user"] | null,
) => {
  const opredId = BigInt(params.id);
  await prisma.opredTag.createMany({
    data: [{ opredId, tagId: body.tagId }],
    skipDuplicates: true,
  });
  return NextResponse.json({ ok: true });
};

const deleteHandler = async (
  req: NextRequest,
  _body: unknown,
  params: { id: string },
  _user: Session["user"] | null,
) => {
  const opredId = BigInt(params.id);
  const tagId = Number(new URL(req.url).searchParams.get("tagId"));
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return NextResponse.json({ error: "Invalid tagId" }, { status: 400 });
  }
  await prisma.opredTag.deleteMany({ where: { opredId, tagId } });
  return NextResponse.json({ ok: true });
};

export const GET = apiRoute(getHandler, {
  requireAuth: true,
  roles: [Role.ADMIN],
});
export const POST = apiRoute<PostBody, { id: string }>(postHandler, {
  requireAuth: true,
  roles: [Role.ADMIN],
  schema: postSchema,
});
export const DELETE = apiRoute(deleteHandler, {
  requireAuth: true,
  roles: [Role.ADMIN],
});
