import { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getNumericUserId } from "@/lib/user";
import { apiRoute } from "@/utils/appRoute";

const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const draftRowSchema = z.object({
  templateKey: z.string().min(1).max(128),
  slotId: z.number().int().nonnegative(),
  word: z.string().max(255),
  definition: z.string().max(1024),
  wordId: z.string().min(1).max(32).nullable(),
  opredId: z.string().min(1).max(32).nullable(),
});

const putSchema = z.object({
  jobId: z.string().min(1),
  rows: z.array(draftRowSchema).max(5000),
});

type PutBody = z.infer<typeof putSchema>;
type DraftRow = z.infer<typeof draftRowSchema>;

type ScanwordFillReviewDraftRecord = {
  data: unknown;
  expiresAt: Date | null;
  updatedAt: Date;
};

function parseJobId(raw: string | null | undefined): bigint | null {
  if (!raw) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function getUserId(user: Session["user"] | null): number | null {
  return getNumericUserId(user as { id?: string | number | null } | null);
}

function parseRowsFromStoredDraft(value: unknown): DraftRow[] {
  if (typeof value === "string") {
    try {
      return parseRowsFromStoredDraft(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== "object") return [];
  const payload = value as { version?: unknown; rows?: unknown };
  if (payload.version !== 2 || !Array.isArray(payload.rows)) return [];
  const parsed = z.array(draftRowSchema).safeParse(payload.rows);
  return parsed.success ? parsed.data : [];
}

function isMissingTableError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021";
}

function isMissingColumnError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022";
}

function isStorageUnavailableError(err: unknown): boolean {
  return isMissingTableError(err) || isMissingColumnError(err);
}

async function cleanupExpiredDrafts(now: Date): Promise<boolean> {
  try {
    await prisma.scanwordFillReviewDraft.deleteMany({
      where: {
        expiresAt: {
          lte: now,
        },
      },
    });
    return true;
  } catch (err) {
    if (isStorageUnavailableError(err)) return false;
    throw err;
  }
}

async function loadStoredDraft(
  jobId: bigint,
  userId: number,
): Promise<{ available: boolean; draft: ScanwordFillReviewDraftRecord | null }> {
  try {
    const draft = await prisma.scanwordFillReviewDraft.findUnique({
      where: {
        jobId_userId: {
          jobId,
          userId,
        },
      },
      select: {
        data: true,
        expiresAt: true,
        updatedAt: true,
      },
    });
    return { available: true, draft };
  } catch (err) {
    if (isStorageUnavailableError(err)) return { available: false, draft: null };
    throw err;
  }
}

async function deleteStoredDraft(jobId: bigint, userId: number): Promise<boolean> {
  try {
    await prisma.scanwordFillReviewDraft.deleteMany({
      where: { jobId, userId },
    });
    return true;
  } catch (err) {
    if (isStorageUnavailableError(err)) return false;
    throw err;
  }
}

async function saveStoredDraft(jobId: bigint, userId: number, rows: DraftRow[], expiresAt: Date): Promise<boolean> {
  const payload = {
    version: 2,
    rows,
  };
  try {
    await prisma.scanwordFillReviewDraft.upsert({
      where: {
        jobId_userId: {
          jobId,
          userId,
        },
      },
      create: {
        jobId,
        userId,
        data: payload,
        expiresAt,
      },
      update: {
        data: payload,
        expiresAt,
      },
    });
    return true;
  } catch (err) {
    if (isStorageUnavailableError(err)) return false;
    throw err;
  }
}

const getHandler = async (
  _req: NextRequest,
  _body: unknown,
  _params: Record<string, never>,
  user: Session["user"] | null,
) => {
  const userId = getUserId(user);
  if (userId == null) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const jobId = parseJobId(_req.nextUrl.searchParams.get("jobId"));
  if (jobId == null) {
    return NextResponse.json({ success: false, message: "Invalid jobId" }, { status: 400 });
  }
  const now = new Date();
  const cleaned = await cleanupExpiredDrafts(now);
  if (!cleaned) {
    return NextResponse.json({ success: true, available: false, rows: [] as DraftRow[] });
  }

  const { available, draft } = await loadStoredDraft(jobId, userId);
  if (!available) {
    return NextResponse.json({ success: true, available: false, rows: [] as DraftRow[] });
  }
  if (!draft) {
    return NextResponse.json({ success: true, available: true, rows: [] as DraftRow[] });
  }

  if (draft.expiresAt && draft.expiresAt <= now) {
    const deleted = await deleteStoredDraft(jobId, userId);
    if (!deleted) {
      return NextResponse.json({ success: true, available: false, rows: [] as DraftRow[] });
    }
    return NextResponse.json({ success: true, available: true, rows: [] as DraftRow[] });
  }

  const rows = parseRowsFromStoredDraft(draft.data);

  return NextResponse.json({
    success: true,
    available: true,
    rows,
    updatedAt: draft.updatedAt.toISOString(),
  });
};

const putHandler = async (
  _req: NextRequest,
  body: PutBody,
  _params: Record<string, never>,
  user: Session["user"] | null,
) => {
  const userId = getUserId(user);
  if (userId == null) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const jobId = parseJobId(body.jobId);
  if (jobId == null) {
    return NextResponse.json({ success: false, message: "Invalid jobId" }, { status: 400 });
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS);

  if (body.rows.length === 0) {
    const deleted = await deleteStoredDraft(jobId, userId);
    if (!deleted) {
      return NextResponse.json({ success: true, available: false });
    }
    return NextResponse.json({ success: true, available: true, rows: 0 });
  }

  const saved = await saveStoredDraft(jobId, userId, body.rows, expiresAt);
  if (!saved) {
    return NextResponse.json({ success: true, available: false });
  }

  await cleanupExpiredDrafts(now);

  return NextResponse.json({ success: true, available: true, rows: body.rows.length });
};

const deleteHandler = async (
  req: NextRequest,
  _body: unknown,
  _params: Record<string, never>,
  user: Session["user"] | null,
) => {
  const userId = getUserId(user);
  if (userId == null) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const jobId = parseJobId(req.nextUrl.searchParams.get("jobId"));
  if (jobId == null) {
    return NextResponse.json({ success: false, message: "Invalid jobId" }, { status: 400 });
  }
  const deleted = await deleteStoredDraft(jobId, userId);
  if (!deleted) {
    return NextResponse.json({ success: true, available: false });
  }
  return NextResponse.json({ success: true, available: true });
};

const routeOptions = {
  requireAuth: true,
  permissions: [Permissions.DictionaryWrite],
};

export const GET = apiRoute(getHandler, routeOptions);
export const PUT = apiRoute<PutBody>(putHandler, {
  ...routeOptions,
  schema: putSchema,
});
export const DELETE = apiRoute(deleteHandler, routeOptions);
