import { Prisma } from "@prisma/client";
import { SquarePen } from "lucide-react";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_DIFFICULTIES } from "@/app/constants/constants";
import { authOptions } from "@/auth";
import { CreatedAt } from "@/components/admin/pending/CreatedAt";
import { DefinitionCarousel } from "@/components/admin/pending/DefinitionCarousel";
import { DescriptionFormFields } from "@/components/admin/pending/DescriptionFormFields";
import { DescriptionView } from "@/components/admin/pending/DescriptionView";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { PendingActions } from "@/components/PendingActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { hasPermissionAsync, Permissions } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getNumericUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

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

async function ensurePendingAccess(): Promise<PendingAccess> {
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

export default async function PendingWordsPage({
  searchParams,
}: {
  // Next.js dynamic route APIs are async; accept Promise and await it
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const { scope, currentLabel, userId } = await ensurePendingAccess();
  const sp = await searchParams;
  const editParam = Array.isArray(sp?.edit) ? sp?.edit?.[0] : (sp?.edit as string | undefined);
  const ownerOr: Array<Record<string, unknown>> = [];
  if (userId != null) {
    ownerOr.push({ createBy: userId }, { descriptions: { some: { createBy: userId } } });
  }
  ownerOr.push({ note: { contains: `"createdBy":"${currentLabel.replace(/"/g, '\\"')}"` } });
  const [pending, languages, difficultyRows] = await Promise.all([
    prisma.pendingWords.findMany({
      where:
        scope === "all"
          ? { status: "PENDING" }
          : {
              status: "PENDING",
              OR: ownerOr,
            },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        descriptions: { orderBy: { createdAt: "asc" } },
        language: true,
        targetWord: true,
      },
    }),
    prisma.language.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { id: "asc" },
    }),
    prisma.opred_v.groupBy({
      by: ["difficulty"],
      where: { is_deleted: false },
      _count: { _all: true },
      orderBy: { difficulty: "asc" },
    }),
  ]);
  const difficulties = difficultyRows.map((r) => r.difficulty);

  // Collect tag IDs from description notes (JSON: { tags?: number[], text?: string }) and fetch names once
  const tagIdSet = new Set<number>();
  // Collect original opred ids for editDef cards to show "from → to"
  const originalOpredIdSet = new Set<bigint>();
  for (const p of pending) {
    for (const d of p.descriptions) {
      if (!d.note) continue;
      try {
        const parsed = JSON.parse(d.note) as unknown;
        if (parsed && typeof parsed === "object") {
          const obj = parsed as { tags?: unknown; opredId?: unknown; kind?: unknown };
          if (Array.isArray(obj.tags)) {
            for (const id of obj.tags) {
              if (typeof id === "number" && Number.isInteger(id)) tagIdSet.add(id);
            }
          }
          if (obj.kind === "editDef" && typeof obj.opredId === "string" && obj.opredId) {
            try {
              originalOpredIdSet.add(BigInt(obj.opredId));
            } catch {}
          }
        }
      } catch {}
    }
  }
  const tagIds = [...tagIdSet];
  const tagRows = tagIds.length
    ? await prisma.tag.findMany({
        where: { id: { in: tagIds } },
        select: { id: true, name: true },
      })
    : [];
  const tagNameById = new Map(tagRows.map((t) => [t.id, t.name] as const));
  const tagNames: Record<string, string> = Object.fromEntries(tagNameById);

  // Fetch original definitions for editDef preview
  const originalOpreds = originalOpredIdSet.size
    ? await prisma.opred_v.findMany({
        where: { id: { in: Array.from(originalOpredIdSet) } },
        select: { id: true, text_opr: true, difficulty: true, end_date: true },
      })
    : [];
  const originalById = new Map(originalOpreds.map((o) => [String(o.id), o] as const));

  const languageOptions = languages.map((l) => ({
    code: l.code,
    name: l.name,
  }));

  const canApprove = scope === "all";

  async function savePending(formData: FormData) {
    "use server";
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

    revalidatePath(`/${locale}/admin/pending`);
  }

  async function approveAction(formData: FormData) {
    "use server";
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
          await tx.opredTag.createMany({
            data: tags.map((tagId) => ({ opredId, tagId })),
          });
        }
        if (updateById != null || approvedById != null) {
          await tx.opred_v.update({
            where: { id: opredId },
            data: {
              ...(updateById != null ? { updateBy: updateById } : {}),
              ...(approvedById != null ? { approvedBy: approvedById } : {}),
            },
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
    revalidatePath(`/${locale}/admin/pending`);
  }

  async function rejectAction(formData: FormData) {
    "use server";
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
    revalidatePath(`/${locale}/admin/pending`);
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pending.map((p) => (
            <Card key={String(p.id)} className="flex h-full flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{p.word_text}</span>
                  <div className="flex items-center gap-2">
                    <Badge>{p.language?.name ?? p.langId}</Badge>
                    {(() => {
                      let kind: string | null = null;
                      if (p.note) {
                        try {
                          const obj = JSON.parse(p.note) as { kind?: string };
                          if (obj?.kind) kind = obj.kind;
                        } catch {}
                      }
                      if (!p.targetWordId) {
                        return <Badge variant="outline">{t("pendingNewWord")}</Badge>;
                      }
                      const isEdit = kind === "editWord" || kind === "editDef";
                      return (
                        <Badge variant="outline">{t(isEdit ? "pendingOperationEdit" : "pendingOperationAdd")}</Badge>
                      );
                    })()}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                {/* Metadata: createdBy only (no CreatedAt display) */}
                <div className="mb-2 text-xs text-muted-foreground">
                  <CreatedAt iso={p.createdAt.toISOString()} />
                  {(() => {
                    let by: string | null = null;
                    if (p.note) {
                      try {
                        const obj = JSON.parse(p.note) as { createdBy?: string };
                        if (obj?.createdBy) by = obj.createdBy;
                      } catch {}
                    }
                    return by ? <div>{t("pendingCreatedBy", { value: by })}</div> : null;
                  })()}
                </div>
                {/* Rename mapping */}
                {p.targetWordId && p.descriptions.length === 0 && p.targetWord && (
                  <p className="mb-3 text-sm">
                    {t("pendingRenameFromTo", { from: p.targetWord.word_text, to: p.word_text })}
                  </p>
                )}
                {String(p.id) === String(editParam ?? "") ? (
                  <form id={`edit-${String(p.id)}`} action={savePending} className="space-y-3">
                    <input type="hidden" name="id" value={String(p.id)} />
                    {p.descriptions.length === 0 &&
                      (() => {
                        let wordNoteText: string | null = null;
                        if (p.note) {
                          try {
                            const parsed = JSON.parse(p.note) as unknown;
                            if (parsed && typeof parsed === "object") {
                              const obj = parsed as { text?: unknown };
                              if (typeof obj.text === "string" && obj.text.trim()) wordNoteText = obj.text.trim();
                            }
                          } catch {
                            // non-JSON fallback if ever needed
                          }
                        }
                        return (
                          <div className="space-y-2">
                            {p.targetWordId && (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">{t("word")}</span>
                                <Input name="word" defaultValue={p.word_text} className="h-7 w-full text-xs" />
                              </div>
                            )}
                            <p className="text-sm text-muted-foreground">
                              {wordNoteText ? t("pendingNote", { note: wordNoteText }) : t("pendingNoDescriptions")}
                            </p>
                          </div>
                        );
                      })()}
                    {p.descriptions.length > 0 && (
                      <DefinitionCarousel
                        items={p.descriptions.map((d, idx) => {
                          let noteText: string | null = null;
                          let tagIdsFromNote: number[] = [];
                          if (d.note) {
                            try {
                              const parsed = JSON.parse(d.note) as unknown;
                              if (parsed && typeof parsed === "object") {
                                const obj = parsed as {
                                  text?: unknown;
                                  tags?: unknown;
                                };
                                if (typeof obj.text === "string" && obj.text.trim()) noteText = obj.text.trim();
                                if (Array.isArray(obj.tags)) {
                                  tagIdsFromNote = obj.tags.filter(
                                    (x): x is number => typeof x === "number" && Number.isInteger(x),
                                  );
                                }
                              }
                            } catch {
                              noteText = d.note; // non-JSON fallback
                            }
                          }
                          return {
                            key: String(d.id),
                            node: (
                              <div className="rounded-md border bg-background p-3">
                                <DescriptionFormFields
                                  idx={idx}
                                  descId={String(d.id)}
                                  description={d.description}
                                  endDateIso={d.end_date ? new Date(d.end_date).toISOString() : null}
                                  showWordInput={!p.targetWordId && idx === 0}
                                  defaultWord={p.word_text}
                                  languages={languageOptions}
                                  defaultLanguageCode={p.language?.code ?? undefined}
                                  difficulties={
                                    difficulties.length ? difficulties : (DEFAULT_DIFFICULTIES as readonly number[])
                                  }
                                  defaultDifficulty={d.difficulty ?? 1}
                                  initialTagIds={tagIdsFromNote}
                                  tagNames={tagNames}
                                  disableLanguage={Boolean(p.targetWordId)}
                                  allowDelete={p.descriptions.length > 1}
                                />
                                {noteText && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {t("pendingNote", { note: noteText })}
                                  </div>
                                )}
                              </div>
                            ),
                          };
                        })}
                      />
                    )}
                  </form>
                ) : (
                  <div className="space-y-3">
                    {p.descriptions.length === 0 &&
                      (() => {
                        let wordNoteText: string | null = null;
                        if (p.note) {
                          try {
                            const parsed = JSON.parse(p.note) as unknown;
                            if (parsed && typeof parsed === "object") {
                              const obj = parsed as { text?: unknown };
                              if (typeof obj.text === "string" && obj.text.trim()) wordNoteText = obj.text.trim();
                            }
                          } catch {
                            // non-JSON fallback if ever needed
                          }
                        }
                        return (
                          <p className="text-sm text-muted-foreground">
                            {wordNoteText ? t("pendingNote", { note: wordNoteText }) : t("pendingNoDescriptions")}
                          </p>
                        );
                      })()}
                    {p.descriptions.length > 0 && (
                      <DefinitionCarousel
                        items={p.descriptions.map((d) => {
                          let noteText: string | null = null;
                          let tagIdsFromNote: number[] = [];
                          let originalText: string | null = null;
                          let isEditDef = false;
                          if (d.note) {
                            try {
                              const parsed = JSON.parse(d.note) as unknown;
                              if (parsed && typeof parsed === "object") {
                                const obj = parsed as {
                                  text?: unknown;
                                  tags?: unknown;
                                  kind?: unknown;
                                  opredId?: unknown;
                                };
                                if (typeof obj.text === "string" && obj.text.trim()) noteText = obj.text.trim();
                                if (Array.isArray(obj.tags)) {
                                  tagIdsFromNote = obj.tags.filter(
                                    (x): x is number => typeof x === "number" && Number.isInteger(x),
                                  );
                                }
                                if (obj.kind === "editDef" && typeof obj.opredId === "string") {
                                  const orig = originalById.get(obj.opredId);
                                  if (orig) originalText = orig.text_opr;
                                  isEditDef = true;
                                }
                              }
                            } catch {
                              noteText = d.note;
                            }
                          }
                          return {
                            key: String(d.id),
                            node: (
                              <div className="space-y-2 rounded-md border bg-background p-3">
                                {isEditDef && originalText && (
                                  <div className="text-xs text-muted-foreground">
                                    {t("pendingDefFromTo", { from: originalText, to: d.description })}
                                  </div>
                                )}
                                <DescriptionView
                                  description={d.description}
                                  difficulty={d.difficulty}
                                  endDateIso={d.end_date ? new Date(d.end_date).toISOString() : null}
                                  tagIds={tagIdsFromNote}
                                  tagNames={tagNames}
                                />
                                {noteText && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {t("pendingNote", { note: noteText })}
                                  </div>
                                )}
                              </div>
                            ),
                          };
                        })}
                      />
                    )}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {String(p.id) === String(editParam ?? "") ? (
                    <>
                      {/* Cancel first (secondary) */}

                      <Button asChild variant="outline" size="sm">
                        <a href={`/${locale}/admin/pending`}>{t("cancel")}</a>
                      </Button>
                      {/* Save button moved inside the form for proper typing */}
                      <ServerActionSubmit
                        action={savePending}
                        variant="default"
                        labelKey="save"
                        successKey="pendingSaved"
                        size="sm"
                        formId={`edit-${String(p.id)}`}
                      />
                    </>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button asChild variant="outline" size="sm">
                          <a href={`?edit=${String(p.id)}`} aria-label={t("edit")}>
                            <SquarePen className="size-4" />
                          </a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("edit")}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {String(p.id) !== String(editParam ?? "") && (
                  <PendingActions
                    id={String(p.id)}
                    descriptionCount={p.descriptions.length}
                    approveAction={approveAction}
                    rejectAction={rejectAction}
                    canApprove={canApprove}
                  />
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
