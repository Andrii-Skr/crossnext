import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/utils/appRoute";
import { z } from "zod";
import type { Session } from "next-auth";
import { Role } from "@prisma/client";

const getHandler = async (
  req: NextRequest,
  _body: unknown,
  _params: {},
  _user: Session["user"] | null
) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};
  const tags = await prisma.tag.findMany({ where, orderBy: { name: "asc" }, take: 20 });
  return NextResponse.json({ items: tags });
};

const schema = z.object({ name: z.string().min(1) });
type Body = z.infer<typeof schema>;

const postHandler = async (
  _req: NextRequest,
  body: Body,
  _params: {},
  _user: Session["user"] | null
): Promise<NextResponse> => {
  const created = await prisma.tag.create({ data: { name: body.name } });
  return NextResponse.json(created);
};

export const GET = apiRoute(getHandler);
export const POST = apiRoute<Body>(postHandler, { schema, requireAuth: true });
