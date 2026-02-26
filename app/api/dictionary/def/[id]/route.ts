import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { withPendingSequenceRetry } from "@/lib/pendingSequences";
import { getNumericUserId } from "@/lib/user";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  text_opr: z.string().min(1),
  note: z.string().max(512).optional(),
});
type Body = z.infer<typeof schema>;

function userLabel(user: Session["user"] | null): string {
  if (!user) return "unknown";
  const u = user as { email?: string | null; name?: string | null; id?: string | null };
  return (u.email || u.name || u.id || "unknown") as string;
}

const putHandler = async (_req: NextRequest, body: Body, params: { id: string }, user: Session["user"] | null) => {
  const createdById = getNumericUserId(user as { id?: string | number | null } | null);
  let opredId: bigint;
  try {
    opredId = BigInt(params.id);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }
  const newText = body.text_opr.trim();

  // Load definition with its word and language
  const def = await prisma.opred_v.findUnique({
    where: { id: opredId },
    select: {
      id: true,
      word_id: true,
      difficulty: true,
      langId: true,
      word_v: { select: { id: true, word_text: true, length: true } },
    },
  });
  if (!def || !def.word_v) {
    return NextResponse.json({ success: false, message: "Definition not found" }, { status: 404 });
  }

  // Prevent duplicate pending card for the same definition (by opredId in note)
  const opredIdStr = String(def.id);
  const existsDef = await prisma.pendingDescriptions.findFirst({
    where: {
      status: "PENDING",
      note: { contains: `"opredId":"${opredIdStr}"` },
      pendingWord: { targetWordId: def.word_id },
    },
    select: { id: true },
  });
  if (existsDef)
    return NextResponse.json(
      { success: false, message: "Pending edit already exists for this definition" },
      { status: 409 },
    );

  // Create a pending card anchored to the base word with a single description entry
  const textNote = (body.note ?? "").trim();
  const createPendingEditCard = async () => {
    return prisma.pendingWords.create({
      data: {
        word_text: def.word_v.word_text,
        length: def.word_v.length,
        langId: def.langId,
        note: JSON.stringify({
          kind: "editDef",
          createdBy: userLabel(user),
          ...(textNote ? { text: textNote } : {}),
        }),
        targetWordId: def.word_v.id,
        ...(createdById != null ? { createBy: createdById } : {}),
        descriptions: {
          create: [
            {
              description: newText,
              // Preserve current difficulty in the pending row
              difficulty: def.difficulty ?? 1,
              note: JSON.stringify({
                kind: "editDef",
                opredId: String(def.id),
                ...(textNote ? { text: textNote } : {}),
              }),
              ...(createdById != null ? { createBy: createdById } : {}),
            },
          ],
        },
      },
      select: { id: true },
    });
  };

  const created = await withPendingSequenceRetry(createPendingEditCard);

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
  const updateById = getNumericUserId(user as { id?: string | number | null } | null);
  let opredId: bigint;
  try {
    opredId = BigInt(params.id);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }
  const updated = await prisma.opred_v.update({
    where: { id: opredId },
    data: {
      is_deleted: true,
      ...(updateById != null ? { updateBy: updateById } : {}),
    },
    select: { id: true },
  });
  return NextResponse.json({ id: String(updated.id), is_deleted: true });
};

export const DELETE = apiRoute(deleteHandler, {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
});
