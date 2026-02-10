import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).max(5000),
});

type Body = z.infer<typeof schema>;

function parseDefinitionId(raw: string): bigint | null {
  const normalized = raw.trim().replace(/n$/i, "").replace(/\.0+$/, "");
  if (!/^-?\d+$/.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

const postHandler = async (_req: NextRequest, body: Body) => {
  const uniqueIds = Array.from(new Set(body.ids.map((id) => id.trim()).filter((id) => id.length > 0)));
  if (!uniqueIds.length) {
    return NextResponse.json({ items: [] as Array<{ id: string; difficulty: number | null }> });
  }

  const parsedIds: bigint[] = [];
  for (const id of uniqueIds) {
    const parsed = parseDefinitionId(id);
    if (parsed == null) continue;
    parsedIds.push(parsed);
  }

  if (!parsedIds.length) {
    return NextResponse.json({ items: [] as Array<{ id: string; difficulty: number | null }> });
  }

  const rows = await prisma.opred_v.findMany({
    where: {
      id: {
        in: parsedIds,
      },
    },
    select: {
      id: true,
      difficulty: true,
    },
  });

  return NextResponse.json({
    items: rows.map((row) => ({
      id: String(row.id),
      difficulty: Number.isFinite(row.difficulty as number) ? (row.difficulty as number) : null,
    })),
  });
};

export const POST = apiRoute<Body>(postHandler, {
  requireAuth: true,
  schema,
});
