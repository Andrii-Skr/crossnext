import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getNumericUserId } from "@/lib/user";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({ end_date: z.string().datetime().nullable() });
type Body = z.infer<typeof schema>;

const getHandler = async (_req: NextRequest, _body: unknown, params: { id: string }, _user: Session["user"] | null) => {
  let opredId: bigint;
  try {
    opredId = BigInt(params.id);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }
  const row = await prisma.opred_v.findUnique({
    where: { id: opredId },
    select: { id: true, end_date: true },
  });
  return NextResponse.json({
    id: String(row?.id ?? params.id),
    end_date: row?.end_date ? row.end_date.toISOString() : null,
  });
};

const putHandler = async (_req: NextRequest, body: Body, params: { id: string }, user: Session["user"] | null) => {
  let opredId: bigint;
  try {
    opredId = BigInt(params.id);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }
  const updateById = getNumericUserId(user as { id?: string | number | null } | null);
  const dt = body.end_date ? new Date(body.end_date) : null;
  const updated = await prisma.opred_v.update({
    where: { id: opredId },
    data: {
      end_date: dt,
      ...(updateById != null ? { updateBy: updateById } : {}),
    },
    select: { id: true, end_date: true },
  });
  return NextResponse.json({
    id: String(updated.id),
    end_date: updated.end_date ? updated.end_date.toISOString() : null,
  });
};

export const GET = apiRoute(getHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
});
export const PUT = apiRoute<Body, { id: string }>(putHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
  schema,
});
