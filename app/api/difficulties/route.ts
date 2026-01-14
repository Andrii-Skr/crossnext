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
          "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  }
  // Get available difficulty values from the source table
  const rows = await prisma.difficulty.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const items = rows.map((r) => r.id);
  cache = { items, ts: Date.now() };
  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
};

export const GET = apiRoute(getHandler);
