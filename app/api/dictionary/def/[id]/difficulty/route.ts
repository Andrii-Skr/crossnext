import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getNumericUserId } from "@/lib/user";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({ difficulty: z.number().int().min(0) });
type Body = z.infer<typeof schema>;

const putHandler = async (_req: NextRequest, body: Body, params: { id: string }, user: Session["user"] | null) => {
  let opredId: bigint;
  try {
    opredId = BigInt(params.id);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }
  const updateById = getNumericUserId(user as { id?: string | number | null } | null);
  const updated = await prisma.opred_v.update({
    where: { id: opredId },
    data: {
      difficulty: body.difficulty,
      ...(updateById != null ? { updateBy: updateById } : {}),
    },
    select: { id: true, difficulty: true },
  });
  return NextResponse.json({
    id: String(updated.id),
    difficulty: updated.difficulty,
  });
};

export const PUT = apiRoute<Body, { id: string }>(putHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
  schema,
});
