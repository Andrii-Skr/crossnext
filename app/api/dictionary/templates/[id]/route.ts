import { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const putSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

type PutBody = z.infer<typeof putSchema>;

function parseTemplateId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

const putHandler = async (_req: NextRequest, body: PutBody, params: { id: string }, _user: Session["user"] | null) => {
  const templateId = parseTemplateId(params.id);
  if (templateId == null) {
    return NextResponse.json({ success: false, message: "Invalid id", errorCode: "INVALID_ID" }, { status: 400 });
  }

  const updated = await prisma.dictionaryFilterTemplate.update({
    where: { id: templateId },
    data: {
      name: body.name.trim(),
    },
    select: { id: true },
  });

  return NextResponse.json({ id: updated.id });
};

const deleteHandler = async (
  _req: NextRequest,
  _body: unknown,
  params: { id: string },
  _user: Session["user"] | null,
) => {
  const templateId = parseTemplateId(params.id);
  if (templateId == null) {
    return NextResponse.json({ success: false, message: "Invalid id", errorCode: "INVALID_ID" }, { status: 400 });
  }

  const usageCount = await prisma.issue.count({
    where: { filterTemplateId: templateId },
  });

  if (usageCount > 0) {
    await prisma.dictionaryFilterTemplate.update({
      where: { id: templateId },
      data: { is_deleted: true },
    });
    return NextResponse.json({ mode: "soft", usageCount });
  }

  try {
    await prisma.dictionaryFilterTemplate.delete({
      where: { id: templateId },
    });
    return NextResponse.json({ mode: "hard" });
  } catch (error: unknown) {
    // Graceful fallback: if a new reference appears between count and delete, hide template instead.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      const fallbackUsageCount = await prisma.issue.count({
        where: { filterTemplateId: templateId },
      });
      await prisma.dictionaryFilterTemplate.update({
        where: { id: templateId },
        data: { is_deleted: true },
      });
      return NextResponse.json({ mode: "soft", usageCount: fallbackUsageCount });
    }
    throw error;
  }
};

export const PUT = apiRoute<PutBody, { id: string }>(putHandler, {
  schema: putSchema,
  requireAuth: true,
  permissions: [Permissions.AdminAccess],
});

export const DELETE = apiRoute<unknown, { id: string }>(deleteHandler, {
  requireAuth: true,
  permissions: [Permissions.AdminAccess],
});
