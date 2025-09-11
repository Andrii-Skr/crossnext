import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Session } from "next-auth";
import { Role } from "@prisma/client";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({ name: z.string().min(1) });
type Body = z.infer<typeof schema>;

const putHandler = async (
  _req: NextRequest,
  body: Body,
  params: { id: string },
  _user: Session["user"] | null
) => {
  const { id } = params;
  const updated = await prisma.tag.update({ where: { id: Number(id) }, data: { name: body.name } });
  return NextResponse.json(updated);
};

const deleteHandler = async (
  _req: NextRequest,
  _body: unknown,
  params: { id: string },
  _user: Session["user"] | null
) => {
  const { id } = params;
  await prisma.tag.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
};

export const PUT = apiRoute<Body, { id: string }>(putHandler, {
  schema,
  requireAuth: true,
  roles: [Role.ADMIN],
});

export const DELETE = apiRoute<unknown, { id: string }>(deleteHandler, {
  requireAuth: true,
  roles: [Role.ADMIN],
});
