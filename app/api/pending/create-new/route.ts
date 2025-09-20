import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/utils/appRoute";
import type { Session } from "next-auth";

const schema = z.object({
  word: z.string().min(1),
  definition: z.string().min(1),
  note: z.string().max(512).optional(),
  language: z.enum(["ru", "en", "uk"]).default("ru"),
  tags: z.array(z.number()).optional(),
  difficulty: z.number().int().min(0).optional(),
  end_date: z.string().datetime().optional().nullable(),
});

type Body = z.infer<typeof schema>;

function normalizeWord(input: string) {
  // Remove spaces and lowercase. No character substitutions.
  return input.replace(/\s+/g, "").toLowerCase();
}

const postHandler = async (
  _req: NextRequest,
  body: Body,
  _params: {},
  _user: Session["user"] | null,
) => {
  const normalized = normalizeWord(body.word ?? "");
  if (!normalized)
    return NextResponse.json(
      { success: false, message: "Empty word" },
      { status: 400 },
    );
  if (!/^\p{L}+$/u.test(normalized)) {
    return NextResponse.json(
      { success: false, message: "Word must contain letters only" },
      { status: 400 },
    );
  }
  const exists = await prisma.word_v.findFirst({
    where: { word_text: normalized, is_deleted: false },
    select: { id: true },
  });
  if (exists)
    return NextResponse.json(
      { success: false, message: "Word already exists" },
      { status: 409 },
    );
  const lang = await prisma.language.findUnique({
    where: { code: body.language },
  });
  if (!lang)
    return NextResponse.json(
      { success: false, message: "Language not found" },
      { status: 400 },
    );

  const textNote = body.note?.trim() ?? "";
  const notePayload =
    body.tags && body.tags.length > 0
      ? { tags: body.tags, ...(textNote ? { text: textNote } : {}), ...(Number.isFinite(body.difficulty as number) ? { difficulty: body.difficulty } : {}) }
      : textNote
        ? { text: textNote, ...(Number.isFinite(body.difficulty as number) ? { difficulty: body.difficulty } : {}) }
        : undefined;
  const noteForDesc = notePayload ? JSON.stringify(notePayload) : "";

  const created = await prisma.pendingWords.create({
    data: {
      word_text: normalized,
      length: normalized.length,
      langId: lang.id,
      note: "",
      descriptions: {
        create: [{
          description: body.definition,
          note: noteForDesc,
          difficulty: body.difficulty ?? 1,
          end_date: body.end_date ? new Date(body.end_date) : null,
        }],
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ success: true, id: String(created.id) });
};

export const POST = apiRoute<Body>(postHandler, { schema, requireAuth: true });
