import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  wordId: z.string().min(1),
  definition: z.string().min(1),
  language: z.enum(["ru", "en", "uk"]).default("ru"),
  tags: z.array(z.number()).optional(),
});

type Body = z.infer<typeof schema>;

const postHandler = async (_req: Request, body: Body) => {
  const wordId = BigInt(body.wordId);
  const word = await prisma.word_v.findUnique({ where: { id: wordId }, select: { id: true, word_text: true, length: true } });
  if (!word) return NextResponse.json({ success: false, message: "Word not found" }, { status: 404 });

  const lang = await prisma.language.findUnique({ where: { code: body.language } });
  if (!lang) return NextResponse.json({ success: false, message: "Language not found" }, { status: 400 });

  const noteForDesc = body.tags && body.tags.length > 0 ? JSON.stringify({ tags: body.tags }) : "";

  const created = await prisma.pendingWords.create({
    data: {
      word_text: word.word_text,
      length: word.length,
      langId: lang.id,
      note: "",
      targetWordId: word.id,
      descriptions: {
        create: [{ description: body.definition, note: noteForDesc }],
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ success: true, id: String(created.id) });
};

export const POST = apiRoute<Body>(postHandler, { schema, requireAuth: true });
