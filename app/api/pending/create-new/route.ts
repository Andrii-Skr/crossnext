import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  word: z.string().min(1),
  definition: z.string().min(1),
  note: z.string().max(512).optional(),
  language: z.string().min(1).default("ru"),
  tags: z.array(z.number()).optional(),
  difficulty: z.number().int().min(0).optional(),
  end_date: z.string().datetime().optional().nullable(),
});

type Body = z.infer<typeof schema>;

function normalizeWord(input: string) {
  // Remove spaces and lowercase. No character substitutions.
  return input.replace(/\s+/g, "").toLowerCase();
}

function userLabel(user: Session["user"] | null): string {
  if (!user) return "unknown";
  const u = user as { email?: string | null; name?: string | null; id?: string | null };
  return (u.email || u.name || u.id || "unknown") as string;
}

const postHandler = async (
  _req: NextRequest,
  body: Body,
  _params: Record<string, never>,
  user: Session["user"] | null,
) => {
  const normalized = normalizeWord(body.word ?? "");
  if (!normalized) return NextResponse.json({ success: false, message: "Empty word" }, { status: 400 });
  if (!/^\p{L}+$/u.test(normalized)) {
    return NextResponse.json({ success: false, message: "Word must contain letters only" }, { status: 400 });
  }
  const exists = await prisma.word_v.findFirst({
    where: { word_text: normalized, is_deleted: false },
    select: { id: true },
  });
  if (exists) return NextResponse.json({ success: false, message: "Word already exists" }, { status: 409 });
  const lang = await prisma.language.findUnique({
    where: { code: body.language.toLowerCase() },
  });
  if (!lang) return NextResponse.json({ success: false, message: "Language not found" }, { status: 400 });

  const textNote = body.note?.trim() ?? "";
  const notePayload =
    body.tags && body.tags.length > 0
      ? {
          tags: body.tags,
          ...(textNote ? { text: textNote } : {}),
          ...(Number.isFinite(body.difficulty as number) ? { difficulty: body.difficulty } : {}),
        }
      : textNote
        ? {
            text: textNote,
            ...(Number.isFinite(body.difficulty as number) ? { difficulty: body.difficulty } : {}),
          }
        : undefined;
  const noteForDesc = notePayload ? JSON.stringify(notePayload) : "";

  const endDate = body.end_date ? new Date(body.end_date) : null;

  const createdId = await prisma.$transaction(async (tx) => {
    const created = await tx.pendingWords.create({
      data: {
        word_text: normalized,
        length: normalized.length,
        langId: lang.id,
        note: JSON.stringify({ kind: "newWord", createdBy: userLabel(user) }),
        descriptions: {
          create: [
            {
              description: body.definition,
              note: noteForDesc,
              difficulty: body.difficulty ?? 1,
            },
          ],
        },
      },
      select: { id: true, descriptions: { select: { id: true } } },
    });

    if (endDate && !Number.isNaN(endDate.getTime())) {
      const [createdDescription] = created.descriptions;
      if (createdDescription) {
        await tx.pendingDescriptions.update({
          where: { id: createdDescription.id },
          data: { end_date: endDate },
        });
      }
    }

    return created.id;
  });

  return NextResponse.json({ success: true, id: String(createdId) });
};

export const POST = apiRoute<Body>(postHandler, { schema, requireAuth: true });
