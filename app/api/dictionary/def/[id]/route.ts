import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { Role } from "@prisma/client";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as { text_opr?: string };
  if (!body.text_opr || !body.text_opr.trim()) {
    return NextResponse.json({ error: "text_opr is required" }, { status: 400 });
  }
  const updated = await prisma.opred_v.update({
    where: { id: BigInt(id) },
    data: { text_opr: body.text_opr.trim() },
    select: { id: true, text_opr: true },
  });
  return NextResponse.json({ id: String(updated.id), text_opr: updated.text_opr });
}

