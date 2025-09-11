import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const getHandler = async (
  _req: NextRequest,
): Promise<NextResponse> => {
  const [words, descriptions] = await Promise.all([
    prisma.pendingWords.count({ where: { status: "PENDING" } }),
    prisma.pendingDescriptions.count({
      where: {
        status: "PENDING",
        // Count only descriptions whose parent pending word is also PENDING
        pendingWord: { status: "PENDING" },
      },
    }),
  ]);
  const total = words + descriptions;
  return NextResponse.json({ total, words, descriptions });
};

export const GET = apiRoute(getHandler);
