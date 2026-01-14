"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { getLocale } from "next-intl/server";
import { authOptions } from "@/auth";
import { hasPermissionAsync, Permissions } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getNumericUserId } from "@/lib/user";

const CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 6; // run at most once per 6h per instance
const CLEANUP_RETENTION_MS = 1000 * 60 * 60 * 24 * 30; // keep 30 days of resolved pendings
const CLEANUP_BATCH_LIMIT = 200; // keep the batch small to avoid long pauses on user actions

type PendingCleanupGlobal = typeof globalThis & {
  __PENDING_CLEANUP_LAST?: number;
  __PENDING_CLEANUP_RUNNING?: boolean;
};

const pendingCleanupState = globalThis as PendingCleanupGlobal;

async function maybeCleanupResolvedPending(): Promise<void> {
  const now = Date.now();
  if (pendingCleanupState.__PENDING_CLEANUP_RUNNING) return;
  if (pendingCleanupState.__PENDING_CLEANUP_LAST) {
    const elapsed = now - pendingCleanupState.__PENDING_CLEANUP_LAST;
    if (elapsed < CLEANUP_INTERVAL_MS) return;
  }

  pendingCleanupState.__PENDING_CLEANUP_RUNNING = true;
  try {
    const cutoff = new Date(now - CLEANUP_RETENTION_MS);
    const oldWords = await prisma.pendingWords.findMany({
      where: {
        status: { in: ["APPROVED", "REJECTED"] },
        createdAt: { lt: cutoff },
        descriptions: { none: { status: "PENDING" } },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: CLEANUP_BATCH_LIMIT,
    });
    if (!oldWords.length) return;

    const wordIds = oldWords.map((w) => w.id);
    await prisma.pendingWords.deleteMany({
      where: { id: { in: wordIds } },
    });
  } finally {
    pendingCleanupState.__PENDING_CLEANUP_LAST = now;
    pendingCleanupState.__PENDING_CLEANUP_RUNNING = false;
  }
}

type PendingScope = "all" | "own";
type PendingAccess = { scope: PendingScope; currentLabel: string; userId: number | null };

function userLabel(user: { email?: string | null; name?: string | null; id?: string | null } | null): string {
  if (!user) return "unknown";
  return (user.email || user.name || user.id || "unknown") as string;
}

function isCreatedBy(
  note: string | null | undefined,
  label: string,
  creatorId: number | null | undefined,
  userId: number | null | undefined,
): boolean {
  if (creatorId != null && userId != null && creatorId === userId) return true;
  if (!note) return false;
  try {
    const parsed = JSON.parse(note) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as { createdBy?: unknown };
      return typeof obj.createdBy === "string" && obj.createdBy === label;
    }
  } catch {
    // ignore non-JSON notes
  }
  return false;
}

export async function ensurePendingAccess(): Promise<PendingAccess> {
  const session = await getServerSession(authOptions);
  const user = session?.user ?? null;
  if (!user) {
    const err = new Error("Unauthorized");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  const { role, email, name, id } = user as {
    role?: string | null;
    email?: string | null;
    name?: string | null;
    id?: string | null;
  };
  const roleStr = role ?? null;
  const currentLabel = userLabel({ email, name, id });
  const userId = getNumericUserId({ id });

  // Moderators (ADMIN / CHIEF_EDITOR with pending:review) can see/approve all
  const hasGlobal = await hasPermissionAsync(roleStr ?? null, Permissions.PendingReview);
  if (hasGlobal) {
    return { scope: "all", currentLabel, userId };
  }

  // Editors see only their own cards and cannot approve
  if (roleStr === "EDITOR") {
    return { scope: "own", currentLabel, userId };
  }

  const err = new Error("Forbidden");
  (err as Error & { status?: number }).status = 403;
  throw err;
}

export async function savePendingAction(formData: FormData) {
  const { scope, currentLabel, userId } = await ensurePendingAccess();
  const updateById = userId ?? null;
  const idRaw = formData.get("id");
  if (!idRaw) return;
  const pendingId = BigInt(String(idRaw));
  const pw = await prisma.pendingWords.findUnique({
    where: { id: pendingId },
    select: { targetWordId: true, note: true, createBy: true },
  });
  if (!pw) return;

  if (scope === "own" && !isCreatedBy(pw.note, currentLabel, pw.createBy, userId)) {
    return;
  }

  const langCode = String(formData.get("language") || "");
  if (langCode && !pw.targetWordId) {
    const lang = await prisma.language.findUnique({
      where: { code: langCode },
    });
    if (lang) {
      await prisma.pendingWords.update({
        where: { id: pendingId },
        data: {
          langId: lang.id,
          ...(updateById != null ? { updateBy: updateById } : {}),
        },
      });
      await prisma.pendingDescriptions.updateMany({
        where: { pendingWordId: pendingId },
        data: {
          langId: lang.id,
          ...(updateById != null ? { updateBy: updateById } : {}),
        },
      });
    }
  }

  const word = String(formData.get("word") || "").trim();
  if (word) {
    await prisma.pendingWords.update({
      where: { id: pendingId },
      data: {
        word_text: word,
        length: word.length,
        ...(updateById != null ? { updateBy: updateById } : {}),
      },
    });
  }

  const updates: Array<Promise<unknown>> = [];
  const deleteDescIds = new Set<string>();
  const tagsToApply = new Map<bigint, number[]>();
  for (const [key, value] of formData.entries()) {
    if (typeof key === "string" && key.startsWith("desc_text_")) {
      const idStr = key.substring("desc_text_".length);
      const descId = BigInt(idStr);
      const text = String(value).trim();
      if (text)
        updates.push(
          prisma.pendingDescriptions.update({
            where: { id: descId },
            data: {
              description: text,
              ...(updateById != null ? { updateBy: updateById } : {}),
            },
          }),
        );
    }
    if (typeof key === "string" && key.startsWith("desc_diff_")) {
      const idStr = key.substring("desc_diff_".length);
      const descId = BigInt(idStr);
      const difficulty = Number.parseInt(String(value), 10);
      if (Number.isFinite(difficulty))
        updates.push(
          prisma.pendingDescriptions.update({
            where: { id: descId },
            data: {
              difficulty,
              ...(updateById != null ? { updateBy: updateById } : {}),
            },
          }),
        );
    }
    if (typeof key === "string" && key.startsWith("desc_end_")) {
      const idStr = key.substring("desc_end_".length);
      const descId = BigInt(idStr);
      const str = String(value);
      const dt = str ? new Date(str) : null;
      if (!str) {
        updates.push(
          prisma.pendingDescriptions.update({
            where: { id: descId },
            data: {
              end_date: null,
              ...(updateById != null ? { updateBy: updateById } : {}),
            },
          }),
        );
      } else if (dt && !Number.isNaN(dt.getTime())) {
        updates.push(
          prisma.pendingDescriptions.update({
            where: { id: descId },
            data: {
              end_date: dt,
              ...(updateById != null ? { updateBy: updateById } : {}),
            },
          }),
        );
      }
    }
    if (typeof key === "string" && key.startsWith("desc_tags_")) {
      const idStr = key.substring("desc_tags_".length);
      const descId = BigInt(idStr);
      let arr: number[] = [];
      try {
        const parsed = JSON.parse(String(value));
        if (Array.isArray(parsed)) {
          arr = parsed.filter((x) => typeof x === "number" && Number.isInteger(x)).map((x) => x as number);
        }
      } catch {}
      tagsToApply.set(descId, arr);
    }
    if (typeof key === "string" && key === "delete_desc_ids") {
      const val = String(value);
      if (val) deleteDescIds.add(val);
    }
  }
  if (updates.length) await Promise.all(updates);

  if (tagsToApply.size > 0) {
    const tagUpdates: Promise<unknown>[] = [];
    for (const [descId, tags] of tagsToApply.entries()) {
      tagUpdates.push(
        (async () => {
          const row = await prisma.pendingDescriptions.findUnique({
            where: { id: descId },
            select: { note: true },
          });
          let obj: Record<string, unknown> = {};
          if (row?.note) {
            try {
              const parsed = JSON.parse(row.note) as unknown;
              if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
            } catch {}
          }
          obj.tags = tags;
          await prisma.pendingDescriptions.update({
            where: { id: descId },
            data: {
              note: JSON.stringify(obj),
              ...(updateById != null ? { updateBy: updateById } : {}),
            },
          });
        })(),
      );
    }
    await Promise.all(tagUpdates);
  }

  // Delete selected descriptions (only if more than one exists)
  if (deleteDescIds.size > 0) {
    const idsToDelete = [...deleteDescIds].map((id) => BigInt(id));
    const descs = await prisma.pendingDescriptions.findMany({
      where: { id: { in: idsToDelete }, pendingWordId: pendingId },
      select: { id: true },
    });
    if (descs.length > 0) {
      await prisma.pendingDescriptions.deleteMany({
        where: { id: { in: descs.map((d) => d.id) } },
      });
    }
  }

  if (updateById != null) {
    await prisma.pendingWords.update({
      where: { id: pendingId },
      data: { updateBy: updateById },
    });
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/pending`);
}

export async function approvePendingAction(formData: FormData) {
  const { scope, userId } = await ensurePendingAccess();
  if (scope === "own") {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  const id = formData.get("id");
  if (!id) return;
  const pendingId = BigInt(String(id));
  const approverId = userId ?? null;

  await prisma.$transaction(async (tx) => {
    const resolveCreatedById = (
      explicit: number | null | undefined,
      note: string | null | undefined,
    ): number | null => {
      if (explicit != null) return explicit;
      if (!note) return null;
      try {
        const parsed = JSON.parse(note) as { createdById?: unknown };
        const raw = parsed?.createdById;
        if (typeof raw === "number" && Number.isFinite(raw)) return raw;
        if (typeof raw === "string") {
          const n = Number.parseInt(raw, 10);
          return Number.isFinite(n) ? n : null;
        }
      } catch {}
      return null;
    };

    const applyTags = async (
      opredId: bigint,
      tags: number[] | null,
      updateById?: number | null,
      approvedById?: number | null,
    ) => {
      if (tags === null) return;
      await tx.opredTag.deleteMany({ where: { opredId } });
      if (tags.length > 0) {
        const addedById = updateById ?? approvedById ?? null;
        await tx.opredTag.createMany({
          data: tags.map((tagId) => ({
            opredId,
            tagId,
            ...(addedById != null ? { addedBy: addedById } : {}),
          })),
        });
      }
    };

    const normalizeDefinition = (text: string | null | undefined) =>
      (text ?? "").trim().replace(/\s+/g, " ").toLowerCase();

    const pw = await tx.pendingWords.findUnique({
      where: { id: pendingId },
      include: { descriptions: true },
    });
    if (!pw || pw.status !== "PENDING") return;
    const pendingCreatorId = resolveCreatedById(pw.createBy, pw.note);

    let wordId = pw.targetWordId ?? null;

    if (!wordId) {
      // Reuse an existing word (same text/lang) so multiple pending definitions don't fail unique constraints
      const existingWord = await tx.word_v.findFirst({
        where: { word_text: pw.word_text, langId: pw.langId, is_deleted: false },
        select: { id: true },
      });
      if (existingWord) {
        wordId = existingWord.id;
      } else {
        try {
          const createdWord = await tx.word_v.create({
            data: {
              word_text: pw.word_text,
              length: pw.length,
              korny: "",
              langId: pw.langId,
              ...(pendingCreatorId != null
                ? { createBy: pendingCreatorId }
                : approverId != null
                  ? { createBy: approverId }
                  : {}),
              ...(approverId != null ? { approvedBy: approverId } : {}),
            },
            select: { id: true },
          });
          wordId = createdWord.id;
        } catch (err) {
          // If a concurrent approval created the word, fallback to fetching it instead of failing
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            const fallback = await tx.word_v.findFirst({
              where: { word_text: pw.word_text, langId: pw.langId },
              select: { id: true },
            });
            if (fallback) {
              wordId = fallback.id;
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }
    }

    // If this pending card represents a word rename (no descriptions, but has targetWordId), apply it
    if (wordId && pw.descriptions.length === 0) {
      await tx.word_v.update({
        where: { id: wordId },
        data: {
          word_text: pw.word_text,
          length: pw.length,
          ...(pendingCreatorId != null
            ? { updateBy: pendingCreatorId }
            : approverId != null
              ? { updateBy: approverId }
              : {}),
          ...(approverId != null ? { approvedBy: approverId } : {}),
        },
      });
    }

    // Create or update opreds for each description and attach tags if encoded in note
    if (!wordId) {
      throw new Error("Invariant: target word not assigned");
    }
    const ensuredWordId: bigint = wordId;
    const existingDefinitions = await tx.opred_v.findMany({
      where: { word_id: ensuredWordId, is_deleted: false },
      select: { id: true, text_opr: true },
    });
    const definitionsByNormalizedText = new Map<string, bigint>();
    for (const def of existingDefinitions) {
      const norm = normalizeDefinition(def.text_opr);
      if (!definitionsByNormalizedText.has(norm)) {
        definitionsByNormalizedText.set(norm, def.id);
      }
    }
    for (const d of pw.descriptions) {
      // Extract info from note
      let parsed: { tags?: number[]; kind?: string; opredId?: string } | null = null;
      if (d.note) {
        try {
          const p = JSON.parse(d.note) as { tags?: number[]; kind?: string; opredId?: string };
          parsed = p;
        } catch {}
      }
      const difficulty = Number.isFinite(d.difficulty as number)
        ? Math.max(0, Math.trunc(d.difficulty as number))
        : undefined;
      const normalizedText = normalizeDefinition(d.description);
      const tagsFromNote = Array.isArray(parsed?.tags)
        ? Array.from(new Set(parsed.tags.filter((x): x is number => typeof x === "number" && Number.isInteger(x))))
        : null;

      const submitterId = resolveCreatedById(d.createBy, d.note) ?? pendingCreatorId ?? approverId;

      // If this description is an edit to an existing definition, update it in place
      if (parsed?.kind === "editDef" && parsed.opredId) {
        const targetId = BigInt(parsed.opredId);
        await tx.opred_v.update({
          where: { id: targetId },
          data: {
            text_opr: d.description,
            length: d.description.length,
            textUpdatedAt: new Date(),
            ...(difficulty !== undefined ? { difficulty } : {}),
            ...(d.end_date ? { end_date: d.end_date } : {}),
            ...(submitterId != null ? { updateBy: submitterId } : {}),
            ...(approverId != null ? { approvedBy: approverId } : {}),
          },
        });
        await tx.pendingDescriptions.update({
          where: { id: d.id },
          data: {
            status: "APPROVED",
            approvedOpredId: targetId,
            ...(approverId != null ? { approvedBy: approverId } : {}),
          },
        });
        await applyTags(targetId, tagsFromNote, submitterId, approverId);
        definitionsByNormalizedText.set(normalizedText, targetId);
        continue;
      }

      const existingId = definitionsByNormalizedText.get(normalizedText);
      if (existingId !== undefined) {
        await tx.pendingDescriptions.update({
          where: { id: d.id },
          data: {
            status: "APPROVED",
            approvedOpredId: existingId,
            ...(approverId != null ? { approvedBy: approverId } : {}),
          },
        });
        await applyTags(existingId, tagsFromNote, submitterId, approverId);
        continue;
      }

      // Otherwise, create a new definition for this word
      const opred = await tx.opred_v.create({
        data: {
          word_id: ensuredWordId,
          text_opr: d.description,
          length: d.description.length,
          textUpdatedAt: new Date(),
          langId: pw.langId,
          ...(difficulty !== undefined ? { difficulty } : {}),
          ...(d.end_date ? { end_date: d.end_date } : {}),
          ...(submitterId != null ? { createBy: submitterId } : {}),
          ...(approverId != null ? { approvedBy: approverId } : {}),
        },
        select: { id: true },
      });
      definitionsByNormalizedText.set(normalizedText, opred.id);

      // Attach tags if present
      await applyTags(opred.id, tagsFromNote, submitterId, approverId);

      await tx.pendingDescriptions.update({
        where: { id: d.id },
        data: {
          status: "APPROVED",
          approvedOpredId: opred.id,
          ...(approverId != null ? { approvedBy: approverId } : {}),
        },
      });
    }

    await tx.pendingWords.update({
      where: { id: pw.id },
      data: {
        status: "APPROVED",
        targetWordId: wordId ?? undefined,
        ...(approverId != null ? { approvedBy: approverId } : {}),
      },
    });
  });

  await maybeCleanupResolvedPending();
  const locale = await getLocale();
  revalidatePath(`/${locale}/pending`);
}

export async function rejectPendingAction(formData: FormData) {
  const { scope, currentLabel, userId } = await ensurePendingAccess();
  const id = formData.get("id");
  if (!id) return;
  const pendingId = BigInt(String(id));

  await prisma.$transaction(async (tx) => {
    const pw = await tx.pendingWords.findUnique({
      where: { id: pendingId },
      include: { descriptions: true },
    });
    if (!pw || pw.status !== "PENDING") return;

    if (scope === "own" && !isCreatedBy(pw.note, currentLabel, pw.createBy, userId)) {
      return;
    }

    await tx.pendingWords.update({
      where: { id: pw.id },
      data: {
        status: "REJECTED",
      },
    });
    for (const d of pw.descriptions) {
      await tx.pendingDescriptions.update({
        where: { id: d.id },
        data: {
          status: "REJECTED",
        },
      });
    }
  });

  await maybeCleanupResolvedPending();
  const locale = await getLocale();
  revalidatePath(`/${locale}/pending`);
}
