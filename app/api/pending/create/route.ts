import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getNumericUserId } from "@/lib/user";
import { apiRoute } from "@/utils/appRoute";

const definitionSchema = z.object({
  definition: z.string().min(1),
  note: z.string().max(512).optional(),
  tags: z.array(z.number()).optional(),
  difficulty: z.number().int().min(0).optional(),
  end_date: z.string().datetime().optional().nullable(),
});

const schema = z
  .object({
    wordId: z.string().min(1),
    definitions: z.array(definitionSchema).min(1).optional(),
    definition: z.string().min(1).optional(),
    note: z.string().max(512).optional(),
    language: z.string().min(1).default("ru"),
    tags: z.array(z.number()).optional(),
    difficulty: z.number().int().min(0).optional(),
    end_date: z.string().datetime().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.definitions && data.definitions.length > 0) return true;
      return Boolean(data.definition);
    },
    { message: "Definition is required" },
  );

type Body = z.infer<typeof schema>;

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
  const createdById = getNumericUserId(user as { id?: string | number | null } | null);
  const wordId = BigInt(body.wordId);
  const word = await prisma.word_v.findUnique({
    where: { id: wordId },
    select: { id: true, word_text: true, length: true, langId: true },
  });
  if (!word) return NextResponse.json({ success: false, message: "Word not found" }, { status: 404 });

  const lang = await prisma.language.findUnique({
    where: { id: word.langId },
  });
  if (!lang) return NextResponse.json({ success: false, message: "Language not found" }, { status: 400 });

  if (body.language && body.language.toLowerCase() !== lang.code.toLowerCase()) {
    return NextResponse.json({ success: false, message: "Language mismatch" }, { status: 400 });
  }

  const defsInput = body.definitions?.length
    ? body.definitions
    : [
        {
          definition: body.definition ?? "",
          note: body.note,
          tags: body.tags,
          difficulty: body.difficulty,
          end_date: body.end_date,
        },
      ];
  const definitionsToCreate = defsInput
    .map((item) => {
      const text = item.definition?.trim() ?? "";
      if (!text) return null;
      const textNote = item.note?.trim() ?? "";
      const notePayload =
        item.tags && item.tags.length > 0
          ? {
              tags: item.tags,
              ...(textNote ? { text: textNote } : {}),
              ...(Number.isFinite(item.difficulty as number) ? { difficulty: item.difficulty } : {}),
            }
          : textNote
            ? {
                text: textNote,
                ...(Number.isFinite(item.difficulty as number) ? { difficulty: item.difficulty } : {}),
              }
            : undefined;
      const noteForDesc = notePayload ? JSON.stringify(notePayload) : "";
      const descEndDate = item.end_date ? new Date(item.end_date) : null;
      return {
        description: text,
        note: noteForDesc,
        difficulty: item.difficulty ?? 1,
        ...(descEndDate && !Number.isNaN(descEndDate.getTime()) ? { end_date: descEndDate } : {}),
        ...(createdById != null ? { createBy: createdById } : {}),
      };
    })
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  if (!definitionsToCreate.length) {
    return NextResponse.json({ success: false, message: "Definition is required" }, { status: 400 });
  }

  const createdId = await prisma.$transaction(async (tx) => {
    const created = await tx.pendingWords.create({
      data: {
        word_text: word.word_text,
        length: word.length,
        langId: lang.id,
        note: JSON.stringify({
          kind: "addDefinition",
          createdBy: userLabel(user),
        }),
        targetWordId: word.id,
        ...(createdById != null ? { createBy: createdById } : {}),
        descriptions: {
          create: definitionsToCreate,
        },
      },
      select: { id: true, descriptions: { select: { id: true } } },
    });

    return created.id;
  });

  return NextResponse.json({ success: true, id: String(createdId) });
};

export const POST = apiRoute<Body>(postHandler, { schema, requireAuth: true });
