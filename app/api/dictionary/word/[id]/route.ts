import type { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { withPendingSequenceRetry } from "@/lib/pendingSequences";
import { getNumericUserId } from "@/lib/user";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  word_text: z.string().min(1),
  note: z.string().max(512).optional(),
});
type Body = z.infer<typeof schema>;

function userLabel(user: Session["user"] | null): string {
  if (!user) return "unknown";
  const u = user as { email?: string | null; name?: string | null; id?: string | null };
  return (u.email || u.name || u.id || "unknown") as string;
}

const getHandler = async (req: NextRequest, _body: unknown, params: { id: string }) => {
  const { searchParams } = new URL(req.url);
  const defSortDirRaw = searchParams.get("defSortDir");
  const defSortDir: "asc" | "desc" | undefined =
    defSortDirRaw === "asc" || defSortDirRaw === "desc" ? defSortDirRaw : undefined;
  const lenDirRaw = searchParams.get("lenDir");
  const lenDir: "asc" | "desc" | undefined = lenDirRaw === "asc" || lenDirRaw === "desc" ? lenDirRaw : undefined;
  const lenField = searchParams.get("lenField") as "word" | "def" | "" | null;
  let wordId: bigint;
  try {
    wordId = BigInt(params.id);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }

  const baseWord = await prisma.word_v.findFirst({
    where: { id: wordId, is_deleted: false },
    select: { id: true, word_text: true, langId: true },
  });
  if (!baseWord) {
    return NextResponse.json({ success: false, message: "Word not found" }, { status: 404 });
  }

  const opredOrderBy: Prisma.opred_vOrderByWithRelationInput[] = defSortDir
    ? [{ text_opr: defSortDir }, { id: "asc" }]
    : lenField === "def" && (lenDir === "asc" || lenDir === "desc")
      ? [{ length: lenDir }, { id: "asc" }]
      : [{ id: "asc" }];

  const now = new Date();
  const defs = await prisma.opred_v.findMany({
    where: {
      word_id: wordId,
      is_deleted: false,
      OR: [{ end_date: null }, { end_date: { gte: now } }],
      langId: baseWord.langId,
    },
    select: {
      id: true,
      text_opr: true,
      difficulty: true,
      end_date: true,
      tags: { select: { tag: { select: { id: true, name: true } } } },
    },
    orderBy: opredOrderBy,
  });

  const defIds = defs.map((d) => d.id);
  const defPendingsRaw = defIds.length
    ? await prisma.pendingDescriptions.findMany({
        where: {
          status: "PENDING",
          OR: defIds.map((id) => ({ note: { contains: `"opredId":"${String(id)}"` } })),
        },
        select: { note: true },
      })
    : [];
  const defPendingSet = new Set<string>();
  for (const r of defPendingsRaw ?? []) {
    try {
      const parsed = JSON.parse(r.note) as { opredId?: string };
      if (parsed?.opredId) defPendingSet.add(parsed.opredId);
    } catch {}
  }

  return NextResponse.json({
    id: String(baseWord.id),
    word_text: baseWord.word_text,
    opred_v: defs.map((d) => ({
      id: String(d.id),
      text_opr: d.text_opr,
      difficulty: d.difficulty,
      end_date: d.end_date ? d.end_date.toISOString() : null,
      is_pending_edit: defPendingSet.has(String(d.id)),
      tags: d.tags.map((t) => ({ tag: { id: t.tag.id, name: t.tag.name } })),
    })),
  });
};

export const GET = apiRoute(getHandler, { requireAuth: true });

const putHandler = async (_req: NextRequest, body: Body, params: { id: string }, user: Session["user"] | null) => {
  const createdById = getNumericUserId(user as { id?: string | number | null } | null);
  let wordId: bigint;
  try {
    wordId = BigInt(params.id);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }
  const newText = body.word_text.trim();

  // Ensure base word exists and get its language
  const base = await prisma.word_v.findUnique({
    where: { id: wordId },
    select: { id: true, langId: true },
  });
  if (!base) {
    return NextResponse.json({ success: false, message: "Word not found" }, { status: 404 });
  }

  // Do not allow creating a second pending rename card for the same word
  const exists = await prisma.pendingWords.findFirst({
    where: { targetWordId: base.id, status: "PENDING", note: { contains: '"kind":"editWord"' } },
    select: { id: true },
  });
  if (exists)
    return NextResponse.json({ success: false, message: "Pending edit already exists for this word" }, { status: 409 });

  // Create a pending card to rename the word
  const textNote = (body.note ?? "").trim();
  const created = await withPendingSequenceRetry(() =>
    prisma.pendingWords.create({
      data: {
        word_text: newText,
        length: newText.length,
        langId: base.langId,
        note: JSON.stringify({
          kind: "editWord",
          createdBy: userLabel(user),
          ...(textNote ? { text: textNote } : {}),
        }),
        targetWordId: base.id,
        ...(createdById != null ? { createBy: createdById } : {}),
      },
      select: { id: true },
    }),
  );

  return NextResponse.json({ success: true, id: String(created.id), status: "PENDING" });
};

export const PUT = apiRoute<Body, { id: string }>(putHandler, {
  schema,
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
});

const deleteHandler = async (
  _req: NextRequest,
  _body: unknown,
  params: { id: string },
  user: Session["user"] | null,
) => {
  const { id } = params;
  let wordId: bigint;
  try {
    wordId = BigInt(id);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }
  const updateById = getNumericUserId(user as { id?: string | number | null } | null);
  await prisma.$transaction(async (tx) => {
    await tx.word_v.update({
      where: { id: wordId },
      data: {
        is_deleted: true,
        ...(updateById != null ? { updateBy: updateById } : {}),
      },
    });
    await tx.opred_v.updateMany({
      where: { word_id: wordId },
      data: {
        is_deleted: true,
        ...(updateById != null ? { updateBy: updateById } : {}),
      },
    });
  });
  return NextResponse.json({ id, is_deleted: true });
};

export const DELETE = apiRoute(deleteHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
});
