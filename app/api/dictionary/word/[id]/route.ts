import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
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

const putHandler = async (_req: NextRequest, body: Body, params: { id: string }, user: Session["user"] | null) => {
  const wordId = BigInt(params.id);
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
  const created = await prisma.pendingWords.create({
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
    },
    select: { id: true },
  });

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
  _user: Session["user"] | null,
) => {
  const { id } = params;
  const wordId = BigInt(id);
  await prisma.$transaction(async (tx) => {
    await tx.word_v.update({
      where: { id: wordId },
      data: { is_deleted: true },
    });
    await tx.opred_v.updateMany({
      where: { word_id: wordId },
      data: { is_deleted: true },
    });
  });
  return NextResponse.json({ id, is_deleted: true });
};

export const DELETE = apiRoute(deleteHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
});
