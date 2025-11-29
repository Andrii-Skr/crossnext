import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
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
    word: z.string().min(1),
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
      };
    })
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  if (!definitionsToCreate.length) {
    return NextResponse.json({ success: false, message: "Definition is required" }, { status: 400 });
  }

  const createdId = await prisma.$transaction(async (tx) => {
    const created = await tx.pendingWords.create({
      data: {
        word_text: normalized,
        length: normalized.length,
        langId: lang.id,
        note: JSON.stringify({ kind: "newWord", createdBy: userLabel(user) }),
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
