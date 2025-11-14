import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { hasPermissionAsync, Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

function userLabel(user: { email?: string | null; name?: string | null; id?: string | null } | null): string {
  if (!user) return "unknown";
  return (user.email || user.name || user.id || "unknown") as string;
}

const getHandler = async (
  _req: NextRequest,
  _body: unknown,
  _params: Record<string, never>,
  user: Session["user"] | null,
): Promise<NextResponse> => {
  if (!user) {
    return NextResponse.json({ total: 0, words: 0, descriptions: 0 }, { status: 401 });
  }
  const { role, email, name, id } = user as {
    role?: string | null;
    email?: string | null;
    name?: string | null;
    id?: string | null;
  };
  const roleStr = role ?? null;

  // Moderators see global counts
  const hasGlobal = await hasPermissionAsync(roleStr ?? null, Permissions.PendingReview);

  let words: number;
  let descriptions: number;

  if (hasGlobal) {
    [words, descriptions] = await Promise.all([
      prisma.pendingWords.count({ where: { status: "PENDING" } }),
      prisma.pendingDescriptions.count({
        where: {
          status: "PENDING",
          pendingWord: { status: "PENDING" },
        },
      }),
    ]);
  } else if (roleStr === "EDITOR") {
    const label = userLabel({ email, name, id });
    [words, descriptions] = await Promise.all([
      prisma.pendingWords.count({
        where: { status: "PENDING", note: { contains: `"createdBy":"${label.replace(/"/g, '\\"')}"` } },
      }),
      prisma.pendingDescriptions.count({
        where: {
          status: "PENDING",
          pendingWord: {
            status: "PENDING",
            note: { contains: `"createdBy":"${label.replace(/"/g, '\\"')}"` },
          },
        },
      }),
    ]);
  } else {
    words = 0;
    descriptions = 0;
  }

  const total = words;
  return NextResponse.json({ total, words, descriptions });
};

export const GET = apiRoute(getHandler, { requireAuth: true });
