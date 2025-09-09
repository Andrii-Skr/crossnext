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
  const body = (await req.json()) as { word_text?: string };
  if (!body.word_text || !body.word_text.trim()) {
    return NextResponse.json({ error: "word_text is required" }, { status: 400 });
  }
  const updated = await prisma.word_v.update({
    where: { id: BigInt(id) },
    data: { word_text: body.word_text.trim() },
    select: { id: true, word_text: true },
  });
  return NextResponse.json({ id: String(updated.id), word_text: updated.word_text });
}

