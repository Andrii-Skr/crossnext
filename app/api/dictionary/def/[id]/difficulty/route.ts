import { Role } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({ difficulty: z.number().int().min(0) });
type Body = z.infer<typeof schema>;

const putHandler = async (_req: NextRequest, body: Body, params: { id: string }, _user: Session["user"] | null) => {
  const opredId = BigInt(params.id);
  const updated = await prisma.opred_v.update({
    where: { id: opredId },
    data: { difficulty: body.difficulty },
    select: { id: true, difficulty: true },
  });
  return NextResponse.json({
    id: String(updated.id),
    difficulty: updated.difficulty,
  });
};

export const PUT = apiRoute<Body, { id: string }>(putHandler, {
  requireAuth: true,
  roles: [Role.ADMIN],
  schema,
});
