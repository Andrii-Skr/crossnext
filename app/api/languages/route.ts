import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const getHandler = async (
  _req: NextRequest,
  _body: unknown,
  _params: Record<string, never>,
  _user: Session["user"] | null,
) => {
  const items = await prisma.language.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { id: "asc" },
  });
  return NextResponse.json({
    items: items.map((l) => ({ id: l.id, code: l.code, name: l.name })),
  });
};

export const GET = apiRoute(getHandler);
