import { Role } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const postHandler = async (
  _req: NextRequest,
  _body: unknown,
  params: { id: string },
  _user: Session["user"] | null,
) => {
  const { id } = params;
  const updated = await prisma.opred_v.update({
    where: { id: BigInt(id) },
    data: { is_deleted: false },
    select: { id: true },
  });
  return NextResponse.json({ id: String(updated.id), is_deleted: false });
};

export const POST = apiRoute(postHandler, {
  requireAuth: true,
  roles: [Role.ADMIN],
});
