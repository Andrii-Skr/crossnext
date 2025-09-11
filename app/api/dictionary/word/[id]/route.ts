import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Session } from "next-auth";
import { Role } from "@prisma/client";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  word_text: z.string().min(1),
});
type Body = z.infer<typeof schema>;

const putHandler = async (
  _req: NextRequest,
  body: Body,
  params: { id: string },
  _user: Session["user"] | null
) => {
  const { id } = params;
  const updated = await prisma.word_v.update({
    where: { id: BigInt(id) },
    data: { word_text: body.word_text.trim() },
    select: { id: true, word_text: true },
  });
  return NextResponse.json({ id: String(updated.id), word_text: updated.word_text });
};

export const PUT = apiRoute<Body, { id: string }>(putHandler, {
  schema,
  requireAuth: true,
  roles: [Role.ADMIN],
});
