import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Session } from "next-auth";
import { Role } from "@prisma/client";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  text_opr: z.string().min(1),
});
type Body = z.infer<typeof schema>;

const putHandler = async (
  _req: NextRequest,
  body: Body,
  params: { id: string },
  _user: Session["user"] | null
) => {
  const { id } = params;
  const updated = await prisma.opred_v.update({
    where: { id: BigInt(id) },
    data: { text_opr: body.text_opr.trim() },
    select: { id: true, text_opr: true },
  });
  return NextResponse.json({ id: String(updated.id), text_opr: updated.text_opr });
};

export const PUT = apiRoute<Body, { id: string }>(putHandler, {
  schema,
  requireAuth: true,
  roles: [Role.ADMIN],
});
