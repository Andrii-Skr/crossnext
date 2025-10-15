import { Role } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({ end_date: z.string().datetime().nullable() });
type Body = z.infer<typeof schema>;

const getHandler = async (_req: NextRequest, _body: unknown, params: { id: string }, _user: Session["user"] | null) => {
  const opredId = BigInt(params.id);
  const row = await prisma.opred_v.findUnique({
    where: { id: opredId },
    select: { id: true, end_date: true },
  });
  return NextResponse.json({
    id: String(row?.id ?? params.id),
    end_date: row?.end_date ? row.end_date.toISOString() : null,
  });
};

const putHandler = async (_req: NextRequest, body: Body, params: { id: string }, _user: Session["user"] | null) => {
  const opredId = BigInt(params.id);
  const dt = body.end_date ? new Date(body.end_date) : null;
  const updated = await prisma.opred_v.update({
    where: { id: opredId },
    data: { end_date: dt },
    select: { id: true, end_date: true },
  });
  return NextResponse.json({
    id: String(updated.id),
    end_date: updated.end_date ? updated.end_date.toISOString() : null,
  });
};

export const GET = apiRoute(getHandler, {
  requireAuth: true,
  roles: [Role.ADMIN],
});
export const PUT = apiRoute<Body, { id: string }>(putHandler, {
  requireAuth: true,
  roles: [Role.ADMIN],
  schema,
});
