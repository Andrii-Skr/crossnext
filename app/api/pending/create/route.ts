import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  wordId: z.string().min(1),
  definition: z.string().min(1),
  note: z.string().max(512).optional(),
  language: z.string().min(1).default("ru"),
  tags: z.array(z.number()).optional(),
  difficulty: z.number().int().min(0).optional(),
  end_date: z.string().datetime().optional().nullable(),
});

type Body = z.infer<typeof schema>;

const postHandler = async (
  _req: NextRequest,
  body: Body,
  _params: Record<string, never>,
  _user: Session["user"] | null,
) => {
  const wordId = BigInt(body.wordId);
  const word = await prisma.word_v.findUnique({
    where: { id: wordId },
    select: { id: true, word_text: true, length: true },
  });
  if (!word)
    return NextResponse.json(
      { success: false, message: "Word not found" },
      { status: 404 },
    );

  const lang = await prisma.language.findUnique({
    where: { code: body.language.toLowerCase() },
  });
  if (!lang)
    return NextResponse.json(
      { success: false, message: "Language not found" },
      { status: 400 },
    );

  const textNote = body.note?.trim() ?? "";
  const notePayload =
    body.tags && body.tags.length > 0
      ? {
          tags: body.tags,
          ...(textNote ? { text: textNote } : {}),
          ...(Number.isFinite(body.difficulty as number)
            ? { difficulty: body.difficulty }
            : {}),
        }
      : textNote
        ? {
            text: textNote,
            ...(Number.isFinite(body.difficulty as number)
              ? { difficulty: body.difficulty }
              : {}),
          }
        : undefined;
  const noteForDesc = notePayload ? JSON.stringify(notePayload) : "";

  const created = await prisma.pendingWords.create({
    data: {
      word_text: word.word_text,
      length: word.length,
      langId: lang.id,
      note: "",
      targetWordId: word.id,
      descriptions: {
        create: [
          {
            description: body.definition,
            note: noteForDesc,
            difficulty: body.difficulty ?? 1,
            end_date: body.end_date ? new Date(body.end_date) : null,
          },
        ],
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ success: true, id: String(created.id) });
};

export const POST = apiRoute<Body>(postHandler, { schema, requireAuth: true });
