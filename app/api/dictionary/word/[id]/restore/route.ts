import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getNumericUserId } from "@/lib/user";
import { apiRoute } from "@/utils/appRoute";

const postHandler = async (_req: NextRequest, _body: unknown, params: { id: string }, user: Session["user"] | null) => {
  const { id } = params;
  const wordId = BigInt(id);
  const updateById = getNumericUserId(user as { id?: string | number | null } | null);
  await prisma.$transaction(async (tx) => {
    await tx.word_v.update({
      where: { id: wordId },
      data: {
        is_deleted: false,
        ...(updateById != null ? { updateBy: updateById } : {}),
      },
    });
    await tx.opred_v.updateMany({
      where: { word_id: wordId },
      data: {
        is_deleted: false,
        ...(updateById != null ? { updateBy: updateById } : {}),
      },
    });
  });
  return NextResponse.json({ id, is_deleted: false });
};

export const POST = apiRoute(postHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
});
