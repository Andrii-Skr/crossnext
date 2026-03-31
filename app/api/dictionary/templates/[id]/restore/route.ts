import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

function parseTemplateId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

const postHandler = async (
  _req: NextRequest,
  _body: unknown,
  params: { id: string },
  _user: Session["user"] | null,
) => {
  const templateId = parseTemplateId(params.id);
  if (templateId == null) {
    return NextResponse.json({ success: false, message: "Invalid id", errorCode: "INVALID_ID" }, { status: 400 });
  }

  const restored = await prisma.dictionaryFilterTemplate.update({
    where: { id: templateId },
    data: { is_deleted: false },
    select: { id: true },
  });

  return NextResponse.json({ id: restored.id, isDeleted: false });
};

export const POST = apiRoute<unknown, { id: string }>(postHandler, {
  requireAuth: true,
  permissions: [Permissions.AdminAccess],
});
