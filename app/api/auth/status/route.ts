import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// Endpoint для внутренней проверки статуса пользователя по id.
export async function GET(request: NextRequest) {
  const token = await getToken({ req: request });
  const idRaw = token?.id;
  const id = typeof idRaw === "string" ? Number(idRaw) : typeof idRaw === "number" ? idRaw : NaN;
  if (!Number.isFinite(id)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id },
    select: { is_deleted: true, role: { select: { code: true } } },
  });
  if (!user) {
    return NextResponse.json({ isDeleted: true }, { status: 404 });
  }

  return NextResponse.json(
    { isDeleted: Boolean(user.is_deleted), role: user.role?.code ?? null },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
