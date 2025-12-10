import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getNumericUserId } from "@/lib/user";
import { apiRoute } from "@/utils/appRoute";

const postHandler = async (_req: NextRequest, _body: unknown, params: { id: string }, user: Session["user"] | null) => {
  const updateById = getNumericUserId(user as { id?: string | number | null } | null);
  let opredId: bigint;
  try {
    opredId = BigInt(params.id);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }
  const updated = await prisma.opred_v.update({
    where: { id: opredId },
    data: {
      is_deleted: false,
      ...(updateById != null ? { updateBy: updateById } : {}),
    },
    select: { id: true },
  });
  return NextResponse.json({ id: String(updated.id), is_deleted: false });
};

export const POST = apiRoute(postHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
});
