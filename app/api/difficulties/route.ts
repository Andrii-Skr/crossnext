import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

// Simple in-memory cache to avoid hammering DB in dev
let cache: { items: number[]; ts: number } | null = null;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

const getHandler = async () => {
  // Serve from cache when fresh
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return NextResponse.json(
      { items: cache.items },
      {
        headers: {
          "Cache-Control":
            "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  }
  // Get distinct existing difficulty values from definitions
  const rows = await prisma.opred_v.groupBy({
    by: ["difficulty"],
    where: { is_deleted: false },
    _count: { _all: true },
    orderBy: { difficulty: "asc" },
  });
  const items = rows.map((r) => r.difficulty);
  cache = { items, ts: Date.now() };
  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
};

export const GET = apiRoute(getHandler);
