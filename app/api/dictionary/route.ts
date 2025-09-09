import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const scope = searchParams.get("scope") || "both"; // word|def|both
  const tag = searchParams.get("tag")?.trim() || undefined;
  const take = Math.min(Number(searchParams.get("take") || 20), 50);
  const cursor = searchParams.get("cursor") ? BigInt(searchParams.get("cursor")!) : undefined;

  const whereWord = q && (scope === "word" || scope === "both") ? { word_text: { contains: q, mode: "insensitive" as const } } : {};
  const whereOpred = q && (scope === "def" || scope === "both") ? { opred_v: { some: { text_opr: { contains: q, mode: "insensitive" as const } } } } : {};

  const whereTag = tag ? { opred_v: { some: { tags: { some: { tag: { name: { contains: tag, mode: "insensitive" as const } } } } } } } : {};

  const where = { is_deleted: false, ...whereWord, ...whereOpred, ...whereTag } as const;

  const items = await prisma.word_v.findMany({
    where,
    orderBy: { id: "asc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      opred_v: {
        where: { is_deleted: false },
        select: {
          id: true,
          text_opr: true,
          tags: { select: { tag: { select: { id: true, name: true } } } },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  const hasMore = items.length > take;
  const data = items.slice(0, take);
  const nextCursor = hasMore ? String(data[data.length - 1].id) : null;

  // Convert BigInt ids to string for JSON safety
  const safe = data.map((w) => ({
    id: String(w.id),
    word_text: w.word_text,
    opred_v: w.opred_v.map((d) => ({
      id: String(d.id),
      text_opr: d.text_opr,
      tags: d.tags.map((t) => ({ tag: { id: t.tag.id, name: t.tag.name } })),
    })),
  }));

  return NextResponse.json({ items: safe, nextCursor });
}
