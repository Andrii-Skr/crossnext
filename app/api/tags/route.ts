import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { Role } from "@prisma/client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};
  const tags = await prisma.tag.findMany({ where, orderBy: { name: "asc" }, take: 20 });
  return NextResponse.json({ items: tags });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as { name: string };
  const created = await prisma.tag.create({ data: { name: body.name } });
  return NextResponse.json(created);
}
