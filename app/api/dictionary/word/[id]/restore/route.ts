import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { Role } from "@prisma/client";
import { apiRoute } from "@/utils/appRoute";

const postHandler = async (
  _req: NextRequest,
  _body: unknown,
  params: { id: string },
  _user: Session["user"] | null,
) => {
  const { id } = params;
  const wordId = BigInt(id);
  await prisma.$transaction(async (tx) => {
    await tx.word_v.update({ where: { id: wordId }, data: { is_deleted: false } });
    await tx.opred_v.updateMany({ where: { word_id: wordId }, data: { is_deleted: false } });
  });
  return NextResponse.json({ id, is_deleted: false });
};

export const POST = apiRoute(postHandler, {
  requireAuth: true,
  roles: [Role.ADMIN],
});

