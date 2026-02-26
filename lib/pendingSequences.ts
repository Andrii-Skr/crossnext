import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const RESYNC_PENDING_WORDS_SEQUENCE_SQL = `
SELECT setval(
  pg_get_serial_sequence('"public"."pending_words"', 'id'),
  COALESCE((SELECT MAX(id) FROM "public"."pending_words"), 0) + 1,
  false
)
`;

const RESYNC_PENDING_DESCRIPTIONS_SEQUENCE_SQL = `
SELECT setval(
  pg_get_serial_sequence('"public"."pending_descriptions"', 'id'),
  COALESCE((SELECT MAX(id) FROM "public"."pending_descriptions"), 0) + 1,
  false
)
`;

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function resyncPendingSequences(): Promise<void> {
  await prisma.$executeRawUnsafe(RESYNC_PENDING_WORDS_SEQUENCE_SQL);
  await prisma.$executeRawUnsafe(RESYNC_PENDING_DESCRIPTIONS_SEQUENCE_SQL);
}

export async function withPendingSequenceRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    await resyncPendingSequences();
    return operation();
  }
}
