"use server";

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { authOptions } from "@/auth";
import { actionError } from "@/lib/action-error";
import { Permissions, requirePermissionAsync } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const editionSchema = z.object({
  name: z.string().trim().min(1).max(255),
});

const issueSchema = z.object({
  editionId: z.number().int().positive(),
  label: z.string().trim().min(1).max(64),
});

const issueTemplateSchema = z.object({
  issueId: z.string().min(1),
  templateId: z.number().int().positive().nullable(),
});

const editionVisibilitySchema = z.object({
  id: z.number().int().positive(),
  hidden: z.boolean(),
});

const issueVisibilitySchema = z.object({
  id: z.string().min(1),
  hidden: z.boolean(),
});

const editionDeleteSchema = z.object({
  id: z.number().int().positive(),
});

const issueDeleteSchema = z.object({
  id: z.string().min(1),
});

const uploadSnapshotSchema = z.object({
  issueId: z.string().min(1),
  templateId: z.number().int().positive().nullable().optional(),
  templateName: z.string().trim().max(120).nullable().optional(),
  fileCount: z.number().int().min(0),
  neededStats: z.record(z.string(), z.number()).nullable().optional(),
  files: z.array(
    z.object({
      key: z.string().min(1),
      name: z.string().min(1),
      size: z.number().int().min(0),
    }),
  ),
  errors: z.array(
    z.object({
      key: z.string().min(1),
      name: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
});

const uploadSnapshotLoadSchema = z.object({
  issueId: z.string().min(1),
});

const fillArchivesLoadSchema = z.object({
  issueId: z.string().min(1),
});

const fillSettingsLoadSchema = z.object({
  issueId: z.string().min(1),
});

const issueSvgSettingsLoadSchema = z.object({
  issueId: z.string().min(1),
});

const SVG_FONT_PT_MIN = 1;
const SVG_FONT_PT_MAX = 72;
const SVG_TYPOGRAPHY_PERCENT_MIN = 40;
const SVG_TYPOGRAPHY_PERCENT_MAX = 200;
const DEFAULT_SVG_TYPOGRAPHY_PERCENT = 80;
const DEFAULT_SVG_CLUE_FONT_PT = 7;
const DEFAULT_SVG_SYSTEM_FONT_FAMILY = "Arial";

type FillJobStatus = "queued" | "running" | "review" | "done" | "error";

const fillJobStatuses = new Set<FillJobStatus>(["queued", "running", "review", "done", "error"]);

const snapshotFilesSchema = z.array(
  z.object({
    key: z.string(),
    name: z.string(),
    size: z.number(),
  }),
);

const snapshotErrorsSchema = z.array(
  z.object({
    key: z.string(),
    name: z.string(),
    reason: z.string(),
  }),
);

const snapshotNeededStatsSchema = z.record(z.string(), z.number());

const fillSettingsSchema = z
  .object({
    issueId: z.string().min(1),
    speedPreset: z.enum(["fast", "medium", "slow"]),
    definitionMaxPerCell: z.number().int().min(1).max(1024),
    definitionMaxPerHalfCell: z.number().int().min(1).max(1024),
  })
  .superRefine((value, ctx) => {
    if (value.definitionMaxPerHalfCell > value.definitionMaxPerCell) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["definitionMaxPerHalfCell"],
        message: "definitionMaxPerHalfCell must be <= definitionMaxPerCell",
      });
    }
  });

const issueSvgSettingsSchema = z
  .object({
    issueId: z.string().min(1),
    clueFontBasePt: z.number().min(SVG_FONT_PT_MIN).max(SVG_FONT_PT_MAX),
    clueFontMinPt: z.number().min(SVG_FONT_PT_MIN).max(SVG_FONT_PT_MAX),
    clueGlyphWidthPct: z.number().int().min(SVG_TYPOGRAPHY_PERCENT_MIN).max(SVG_TYPOGRAPHY_PERCENT_MAX),
    clueLineHeightPct: z.number().int().min(SVG_TYPOGRAPHY_PERCENT_MIN).max(SVG_TYPOGRAPHY_PERCENT_MAX),
    fontId: z.string().min(1).nullable().optional(),
    systemFontFamily: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.clueFontMinPt > value.clueFontBasePt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clueFontMinPt"],
        message: "clueFontMinPt must be <= clueFontBasePt",
      });
    }
  });

async function ensureScanwordsAccess() {
  const session = await getServerSession(authOptions);
  await requirePermissionAsync(session?.user ?? null, Permissions.AdminAccess);
  return session;
}

function isScanwordFillSettingsCompoundKeyValidationError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientValidationError)) {
    return false;
  }
  const message = typeof error.message === "string" ? error.message : "";
  return message.includes("Unknown argument `userId_issueId`");
}

function normalizeName(value: string) {
  return value.trim();
}

function slugifyCodeBase(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
  return cleaned || "EDITION";
}

function buildCandidateCode(base: string, suffix: number | null) {
  const trimmedBase = base.slice(0, 32);
  if (!suffix) return trimmedBase;
  const suffixText = `_${suffix}`;
  const available = 32 - suffixText.length;
  return `${trimmedBase.slice(0, Math.max(1, available))}${suffixText}`;
}

function snapshotCutoffDate() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

function toIntOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function normalizeSystemFontFamily(value: string | null | undefined): string {
  if (typeof value !== "string") return DEFAULT_SVG_SYSTEM_FONT_FAMILY;
  const normalized = value
    .replace(/[\r\n\t]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return normalized.length > 0 ? normalized.slice(0, 120) : DEFAULT_SVG_SYSTEM_FONT_FAMILY;
}

function defaultIssueSvgSettings() {
  return {
    clueFontBasePt: DEFAULT_SVG_CLUE_FONT_PT,
    clueFontMinPt: DEFAULT_SVG_CLUE_FONT_PT,
    clueGlyphWidthPct: DEFAULT_SVG_TYPOGRAPHY_PERCENT,
    clueLineHeightPct: DEFAULT_SVG_TYPOGRAPHY_PERCENT,
    fontId: null as string | null,
    systemFontFamily: DEFAULT_SVG_SYSTEM_FONT_FAMILY,
  };
}

function isMissingTableError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === "P2021") return true;
  if (err.code !== "P2010") return false;

  const meta = err.meta as
    | {
        code?: unknown;
        message?: unknown;
        driverAdapterError?: { code?: unknown; message?: unknown; name?: unknown; cause?: unknown } | unknown;
      }
    | undefined;
  const driverAdapterError =
    meta?.driverAdapterError && typeof meta.driverAdapterError === "object" && !Array.isArray(meta.driverAdapterError)
      ? (meta.driverAdapterError as { code?: unknown; message?: unknown; name?: unknown; cause?: unknown })
      : null;
  const cause =
    driverAdapterError?.cause &&
    typeof driverAdapterError.cause === "object" &&
    !Array.isArray(driverAdapterError.cause)
      ? (driverAdapterError.cause as { code?: unknown; message?: unknown; name?: unknown })
      : null;

  const pgCodeCandidates = [meta?.code, driverAdapterError?.code, cause?.code];
  if (pgCodeCandidates.some((value) => typeof value === "string" && value.trim() === "42P01")) {
    return true;
  }

  const text = [
    err.message,
    typeof meta?.message === "string" ? meta.message : "",
    typeof driverAdapterError?.message === "string" ? driverAdapterError.message : "",
    typeof driverAdapterError?.name === "string" ? driverAdapterError.name : "",
    typeof cause?.message === "string" ? cause.message : "",
    typeof cause?.name === "string" ? cause.name : "",
  ]
    .join(" ")
    .toLowerCase();
  return (text.includes("relation") && text.includes("does not exist")) || text.includes("tabledoesnotexist");
}

function isMissingColumnError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === "P2022") return true;
  if (err.code !== "P2010") return false;

  const meta = err.meta as
    | {
        code?: unknown;
        message?: unknown;
        driverAdapterError?: { code?: unknown; message?: unknown; name?: unknown; cause?: unknown } | unknown;
      }
    | undefined;
  const driverAdapterError =
    meta?.driverAdapterError && typeof meta.driverAdapterError === "object" && !Array.isArray(meta.driverAdapterError)
      ? (meta.driverAdapterError as { code?: unknown; message?: unknown; name?: unknown; cause?: unknown })
      : null;
  const cause =
    driverAdapterError?.cause &&
    typeof driverAdapterError.cause === "object" &&
    !Array.isArray(driverAdapterError.cause)
      ? (driverAdapterError.cause as { code?: unknown; message?: unknown; name?: unknown })
      : null;

  const pgCodeCandidates = [meta?.code, driverAdapterError?.code, cause?.code];
  if (pgCodeCandidates.some((value) => typeof value === "string" && value.trim() === "42703")) {
    return true;
  }

  const text = [
    err.message,
    typeof meta?.message === "string" ? meta.message : "",
    typeof driverAdapterError?.message === "string" ? driverAdapterError.message : "",
    typeof driverAdapterError?.name === "string" ? driverAdapterError.name : "",
    typeof cause?.message === "string" ? cause.message : "",
    typeof cause?.name === "string" ? cause.name : "",
  ]
    .join(" ")
    .toLowerCase();
  return (text.includes("column") && text.includes("does not exist")) || text.includes("columndoesnotexist");
}

function normalizeFillArchiveStatus(statusRaw: string | null | undefined): FillJobStatus {
  const normalized = statusRaw ?? "done";
  return fillJobStatuses.has(normalized as FillJobStatus) ? (normalized as FillJobStatus) : "done";
}

function isArchiveVersionFileName(fileName: string, jobId: string): boolean {
  if (fileName === `scanwords_${jobId}.zip`) return true;
  return new RegExp(`^scanwords_${jobId}__\\d{10,}\\.zip$`).test(fileName);
}

async function readArchiveVersionFiles(
  jobId: string,
  outputPath: string,
): Promise<Array<{ fileName: string; updatedAt: Date | null }>> {
  const directory = path.dirname(outputPath);
  let files: string[] = [];
  try {
    files = await readdir(directory);
  } catch {
    return [];
  }

  const matched = files.filter((fileName) => isArchiveVersionFileName(fileName, jobId));
  if (!matched.length) return [];
  const withStats = await Promise.all(
    matched.map(async (fileName) => {
      const filePath = path.join(directory, fileName);
      try {
        const fileStats = await stat(filePath);
        return {
          fileName,
          updatedAt: fileStats.mtime,
        };
      } catch {
        return {
          fileName,
          updatedAt: null,
        };
      }
    }),
  );
  withStats.sort((a, b) => {
    const left = a.updatedAt?.getTime() ?? 0;
    const right = b.updatedAt?.getTime() ?? 0;
    return right - left;
  });
  return withStats;
}

async function getExistingEditionByName(name: string) {
  return prisma.edition.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, deletedAt: true, hidden: true },
  });
}

async function generateUniqueEditionCode(base: string) {
  const existing = await prisma.edition.findMany({
    where: { code: { startsWith: base } },
    select: { code: true },
  });
  const used = new Set(existing.map((row) => row.code));
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = buildCandidateCode(base, i);
    if (!used.has(candidate)) return candidate;
  }
  return buildCandidateCode(base, Date.now() % 1000);
}

export async function createEditionAction(input: z.infer<typeof editionSchema>) {
  await ensureScanwordsAccess();
  const data = editionSchema.parse(input);
  const name = normalizeName(data.name);
  const existing = await getExistingEditionByName(name);
  if (existing) {
    if (existing.deletedAt || existing.hidden) {
      await prisma.edition.update({
        where: { id: existing.id },
        data: { deletedAt: null, hidden: false },
        select: { id: true },
      });
      const locale = await getLocale();
      revalidatePath(`/${locale}/scanwords`);
    }
    return { id: existing.id, created: false };
  }

  const base = slugifyCodeBase(name);
  let code = await generateUniqueEditionCode(base);
  let createdId: number | null = null;

  try {
    const created = await prisma.edition.create({ data: { code, name }, select: { id: true } });
    createdId = created.id;
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const retryExisting = await getExistingEditionByName(name);
      if (retryExisting) {
        return { id: retryExisting.id, created: false };
      }
      const fallback = await generateUniqueEditionCode(base);
      if (fallback !== code) {
        code = fallback;
        const created = await prisma.edition.create({ data: { code, name }, select: { id: true } });
        createdId = created.id;
      } else {
        throw actionError("DUPLICATE_EDITION", 409);
      }
    } else {
      throw e;
    }
  }
  const locale = await getLocale();
  revalidatePath(`/${locale}/scanwords`);
  if (createdId == null) {
    throw actionError("EDITION_CREATION_FAILED", 500);
  }
  return { id: createdId, created: true };
}

export async function createIssueAction(input: z.infer<typeof issueSchema>) {
  await ensureScanwordsAccess();
  const data = issueSchema.parse(input);

  const issueNumber = await prisma.issueNumber.upsert({
    where: { label: data.label },
    update: {},
    create: {
      label: data.label,
      year: null,
      seq: null,
      series: null,
    },
    select: { id: true },
  });

  const existingIssue = await prisma.issue.findUnique({
    where: {
      editionId_issueNumberId: {
        editionId: data.editionId,
        issueNumberId: issueNumber.id,
      },
    },
    select: { id: true, deletedAt: true, hidden: true },
  });

  if (existingIssue) {
    if (existingIssue.deletedAt || existingIssue.hidden) {
      await prisma.issue.update({
        where: { id: existingIssue.id },
        data: { deletedAt: null, hidden: false },
        select: { id: true },
      });
      const locale = await getLocale();
      revalidatePath(`/${locale}/scanwords`);
    }
    return { id: String(existingIssue.id) };
  }

  try {
    const created = await prisma.issue.create({
      data: {
        editionId: data.editionId,
        issueNumberId: issueNumber.id,
      },
      select: { id: true },
    });
    const locale = await getLocale();
    revalidatePath(`/${locale}/scanwords`);
    return { id: String(created.id) };
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const retry = await prisma.issue.findUnique({
        where: {
          editionId_issueNumberId: {
            editionId: data.editionId,
            issueNumberId: issueNumber.id,
          },
        },
        select: { id: true, deletedAt: true, hidden: true },
      });
      if (retry) {
        if (retry.deletedAt || retry.hidden) {
          await prisma.issue.update({
            where: { id: retry.id },
            data: { deletedAt: null, hidden: false },
            select: { id: true },
          });
        }
        const locale = await getLocale();
        revalidatePath(`/${locale}/scanwords`);
        return { id: String(retry.id) };
      }
      throw actionError("DUPLICATE_ISSUE", 409);
    }
    throw e;
  }
}

export async function updateIssueTemplateAction(input: z.infer<typeof issueTemplateSchema>) {
  await ensureScanwordsAccess();
  const data = issueTemplateSchema.parse(input);
  const issueId = BigInt(data.issueId);

  await prisma.issue.update({
    where: { id: issueId },
    data: { filterTemplateId: data.templateId },
    select: { id: true },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/scanwords`);
}

export async function updateEditionHiddenAction(input: z.infer<typeof editionVisibilitySchema>) {
  await ensureScanwordsAccess();
  const data = editionVisibilitySchema.parse(input);
  await prisma.edition.update({
    where: { id: data.id },
    data: { hidden: data.hidden },
    select: { id: true },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/scanwords`);
}

export async function updateIssueHiddenAction(input: z.infer<typeof issueVisibilitySchema>) {
  await ensureScanwordsAccess();
  const data = issueVisibilitySchema.parse(input);
  const issueId = BigInt(data.id);
  await prisma.issue.update({
    where: { id: issueId },
    data: { hidden: data.hidden },
    select: { id: true },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/scanwords`);
}

export async function deleteEditionAction(input: z.infer<typeof editionDeleteSchema>) {
  await ensureScanwordsAccess();
  const data = editionDeleteSchema.parse(input);
  await prisma.edition.update({
    where: { id: data.id },
    data: { deletedAt: new Date(), hidden: true },
    select: { id: true },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/scanwords`);
}

export async function deleteIssueAction(input: z.infer<typeof issueDeleteSchema>) {
  await ensureScanwordsAccess();
  const data = issueDeleteSchema.parse(input);
  const issueId = BigInt(data.id);
  await prisma.issue.update({
    where: { id: issueId },
    data: { deletedAt: new Date(), hidden: true },
    select: { id: true },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/scanwords`);
}

export async function saveScanwordUploadSnapshotAction(input: z.infer<typeof uploadSnapshotSchema>) {
  await ensureScanwordsAccess();
  const data = uploadSnapshotSchema.parse(input);
  const issueId = BigInt(data.issueId);
  const cutoff = snapshotCutoffDate();
  await prisma.scanwordUploadSnapshot.deleteMany({
    where: { updatedAt: { lt: cutoff } },
  });

  await prisma.scanwordUploadSnapshot.upsert({
    where: { issueId },
    update: {
      templateId: data.templateId ?? null,
      templateName: data.templateName ?? null,
      fileCount: data.fileCount,
      errorCount: data.errors.length,
      neededStats: data.neededStats ?? Prisma.JsonNull,
      files: data.files,
      errors: data.errors,
    },
    create: {
      issueId,
      templateId: data.templateId ?? null,
      templateName: data.templateName ?? null,
      fileCount: data.fileCount,
      errorCount: data.errors.length,
      neededStats: data.neededStats ?? Prisma.JsonNull,
      files: data.files,
      errors: data.errors,
    },
    select: { id: true },
  });
}

export async function getScanwordUploadSnapshotAction(input: z.infer<typeof uploadSnapshotLoadSchema>) {
  await ensureScanwordsAccess();
  const data = uploadSnapshotLoadSchema.parse(input);
  const issueId = BigInt(data.issueId);
  const cutoff = snapshotCutoffDate();
  await prisma.scanwordUploadSnapshot.deleteMany({
    where: { updatedAt: { lt: cutoff } },
  });

  const snapshot = await prisma.scanwordUploadSnapshot.findUnique({
    where: { issueId },
    select: {
      templateId: true,
      templateName: true,
      fileCount: true,
      errorCount: true,
      neededStats: true,
      files: true,
      errors: true,
      updatedAt: true,
    },
  });

  if (!snapshot) return null;

  const files = snapshotFilesSchema.safeParse(snapshot.files);
  const errors = snapshotErrorsSchema.safeParse(snapshot.errors);
  const neededStats = snapshotNeededStatsSchema.safeParse(snapshot.neededStats ?? {});

  return {
    templateId: snapshot.templateId,
    templateName: snapshot.templateName,
    fileCount: snapshot.fileCount,
    errorCount: snapshot.errorCount,
    files: files.success ? files.data : [],
    errors: errors.success ? errors.data : [],
    neededStats: neededStats.success ? neededStats.data : null,
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}

export async function getScanwordFillArchivesAction(input: z.infer<typeof fillArchivesLoadSchema>) {
  await ensureScanwordsAccess();
  const data = fillArchivesLoadSchema.parse(input);
  const issueId = BigInt(data.issueId);
  try {
    const rows = await prisma.scanwordFillJob.findMany({
      where: {
        issueId,
        outputPath: { not: null },
      },
      orderBy: { id: "desc" },
      select: {
        id: true,
        status: true,
        completedTemplates: true,
        totalTemplates: true,
        outputPath: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const archives: Array<{
      id: string;
      archiveKey: string;
      archiveFileName: string | null;
      status: FillJobStatus;
      completedTemplates: number | null;
      totalTemplates: number | null;
      createdAt: string | null;
      updatedAt: string | null;
    }> = [];

    for (const row of rows) {
      const jobId = String(row.id);
      const status = normalizeFillArchiveStatus(row.status);
      const completedTemplates = toIntOrNull(row.completedTemplates);
      const totalTemplates = toIntOrNull(row.totalTemplates);
      const createdAt = row.createdAt.toISOString();
      const fallbackUpdatedAt = row.updatedAt.toISOString();
      const outputPath = row.outputPath;
      const fallbackArchiveFileName = outputPath ? path.basename(outputPath) : null;

      if (outputPath) {
        const versions = await readArchiveVersionFiles(jobId, outputPath);
        if (versions.length > 0) {
          for (const version of versions) {
            archives.push({
              id: jobId,
              archiveKey: `${jobId}:${version.fileName}`,
              archiveFileName: version.fileName,
              status,
              completedTemplates,
              totalTemplates,
              createdAt,
              updatedAt: version.updatedAt ? version.updatedAt.toISOString() : fallbackUpdatedAt,
            });
          }
          continue;
        }
      }

      archives.push({
        id: jobId,
        archiveKey: `${jobId}:${fallbackArchiveFileName ?? fallbackUpdatedAt}`,
        archiveFileName: fallbackArchiveFileName,
        status,
        completedTemplates,
        totalTemplates,
        createdAt,
        updatedAt: fallbackUpdatedAt,
      });
    }

    return archives;
  } catch (err: unknown) {
    if (isMissingTableError(err)) {
      return [];
    }
    if (isMissingColumnError(err)) {
      try {
        const rows = await prisma.scanwordFillJob.findMany({
          where: {
            issueId,
            outputPath: { not: null },
          },
          orderBy: { id: "desc" },
          select: {
            id: true,
            status: true,
            outputPath: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        const archives: Array<{
          id: string;
          archiveKey: string;
          archiveFileName: string | null;
          status: FillJobStatus;
          completedTemplates: null;
          totalTemplates: null;
          createdAt: string | null;
          updatedAt: string | null;
        }> = [];
        for (const row of rows) {
          const jobId = String(row.id);
          const status = normalizeFillArchiveStatus(row.status);
          const createdAt = row.createdAt.toISOString();
          const fallbackUpdatedAt = row.updatedAt.toISOString();
          const outputPath = row.outputPath;
          const fallbackArchiveFileName = outputPath ? path.basename(outputPath) : null;

          if (outputPath) {
            const versions = await readArchiveVersionFiles(jobId, outputPath);
            if (versions.length > 0) {
              for (const version of versions) {
                archives.push({
                  id: jobId,
                  archiveKey: `${jobId}:${version.fileName}`,
                  archiveFileName: version.fileName,
                  status,
                  completedTemplates: null,
                  totalTemplates: null,
                  createdAt,
                  updatedAt: version.updatedAt ? version.updatedAt.toISOString() : fallbackUpdatedAt,
                });
              }
              continue;
            }
          }

          archives.push({
            id: jobId,
            archiveKey: `${jobId}:${fallbackArchiveFileName ?? fallbackUpdatedAt}`,
            archiveFileName: fallbackArchiveFileName,
            status,
            completedTemplates: null,
            totalTemplates: null,
            createdAt,
            updatedAt: fallbackUpdatedAt,
          });
        }
        return archives;
      } catch (fallbackErr) {
        if (isMissingTableError(fallbackErr)) {
          return [];
        }
        if (isMissingColumnError(fallbackErr)) {
          // Older schema can lack recently-added columns. Return no archives instead of throwing.
          return [];
        }
        throw fallbackErr;
      }
    }
    throw err;
  }
}

export async function listScanwordSvgFontsAction() {
  await ensureScanwordsAccess();
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: bigint;
        displayName: string;
        familyName: string;
        format: string;
        mimeType: string;
        fileName: string;
        sha256: string;
        sizeBytes: bigint;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(Prisma.sql`
      SELECT
        "id",
        "displayName",
        "familyName",
        "format",
        "mimeType",
        "fileName",
        "sha256",
        "sizeBytes",
        "createdAt",
        "updatedAt"
      FROM "public"."scanword_svg_fonts"
      ORDER BY "displayName" ASC, "id" DESC
    `);
    return rows.map((row) => ({
      id: String(row.id),
      displayName: row.displayName,
      familyName: row.familyName,
      format: row.format,
      mimeType: row.mimeType,
      fileName: row.fileName,
      sha256: row.sha256,
      sizeBytes: Number(row.sizeBytes),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  } catch (error) {
    if (isMissingTableError(error) || isMissingColumnError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getScanwordIssueSvgSettingsAction(input: z.infer<typeof issueSvgSettingsLoadSchema>) {
  await ensureScanwordsAccess();
  const data = issueSvgSettingsLoadSchema.parse(input);
  const issueId = BigInt(data.issueId);
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        clueFontBasePt: number;
        clueFontMinPt: number;
        clueGlyphWidthPct: number | null;
        clueLineHeightPct: number | null;
        fontId: bigint | null;
        systemFontFamily: string | null;
      }>
    >(Prisma.sql`
      SELECT
        "clueFontBasePt",
        "clueFontMinPt",
        "clueGlyphWidthPct",
        "clueLineHeightPct",
        "fontId",
        "systemFontFamily"
      FROM "public"."scanword_issue_svg_settings"
      WHERE "issueId" = ${issueId}
      LIMIT 1
    `);
    const settings = rows[0] ?? null;
    if (!settings) return defaultIssueSvgSettings();
    return {
      clueFontBasePt: settings.clueFontBasePt,
      clueFontMinPt: Math.min(settings.clueFontMinPt, settings.clueFontBasePt),
      clueGlyphWidthPct: settings.clueGlyphWidthPct ?? DEFAULT_SVG_TYPOGRAPHY_PERCENT,
      clueLineHeightPct: settings.clueLineHeightPct ?? DEFAULT_SVG_TYPOGRAPHY_PERCENT,
      fontId: settings.fontId ? String(settings.fontId) : null,
      systemFontFamily: normalizeSystemFontFamily(settings.systemFontFamily),
    };
  } catch (error) {
    if (isMissingTableError(error) || isMissingColumnError(error)) {
      return defaultIssueSvgSettings();
    }
    throw error;
  }
}

export async function saveScanwordIssueSvgSettingsAction(input: z.infer<typeof issueSvgSettingsSchema>) {
  await ensureScanwordsAccess();
  const data = issueSvgSettingsSchema.parse(input);
  const issueId = BigInt(data.issueId);
  const fontId = data.fontId ? BigInt(data.fontId) : null;
  const clueFontBasePt = Math.max(SVG_FONT_PT_MIN, Math.min(SVG_FONT_PT_MAX, data.clueFontBasePt));
  const clueFontMinPtRaw = Math.max(SVG_FONT_PT_MIN, Math.min(SVG_FONT_PT_MAX, data.clueFontMinPt));
  const clueFontMinPt = Math.min(clueFontMinPtRaw, clueFontBasePt);
  const clueGlyphWidthPct = Math.max(
    SVG_TYPOGRAPHY_PERCENT_MIN,
    Math.min(SVG_TYPOGRAPHY_PERCENT_MAX, Math.trunc(data.clueGlyphWidthPct)),
  );
  const clueLineHeightPct = Math.max(
    SVG_TYPOGRAPHY_PERCENT_MIN,
    Math.min(SVG_TYPOGRAPHY_PERCENT_MAX, Math.trunc(data.clueLineHeightPct)),
  );
  const systemFontFamily = normalizeSystemFontFamily(data.systemFontFamily ?? DEFAULT_SVG_SYSTEM_FONT_FAMILY);

  if (fontId != null) {
    const rows = await prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT "id"
      FROM "public"."scanword_svg_fonts"
      WHERE "id" = ${fontId}
      LIMIT 1
    `);
    const font = rows[0] ?? null;
    if (!font) {
      throw actionError("SVG_FONT_NOT_FOUND", 404);
    }
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "public"."scanword_issue_svg_settings"
      ("issueId", "clueFontBasePt", "clueFontMinPt", "clueGlyphWidthPct", "clueLineHeightPct", "fontId", "systemFontFamily", "updatedAt")
    VALUES
      (${issueId}, ${clueFontBasePt}, ${clueFontMinPt}, ${clueGlyphWidthPct}, ${clueLineHeightPct}, ${fontId}, ${systemFontFamily}, NOW())
    ON CONFLICT ("issueId")
    DO UPDATE SET
      "clueFontBasePt" = EXCLUDED."clueFontBasePt",
      "clueFontMinPt" = EXCLUDED."clueFontMinPt",
      "clueGlyphWidthPct" = EXCLUDED."clueGlyphWidthPct",
      "clueLineHeightPct" = EXCLUDED."clueLineHeightPct",
      "fontId" = EXCLUDED."fontId",
      "systemFontFamily" = EXCLUDED."systemFontFamily",
      "updatedAt" = NOW()
  `);

  const rows = await prisma.$queryRaw<
    Array<{
      clueFontBasePt: number;
      clueFontMinPt: number;
      clueGlyphWidthPct: number | null;
      clueLineHeightPct: number | null;
      fontId: bigint | null;
      systemFontFamily: string | null;
    }>
  >(Prisma.sql`
    SELECT
      "clueFontBasePt",
      "clueFontMinPt",
      "clueGlyphWidthPct",
      "clueLineHeightPct",
      "fontId",
      "systemFontFamily"
    FROM "public"."scanword_issue_svg_settings"
    WHERE "issueId" = ${issueId}
    LIMIT 1
  `);
  const settings = rows[0];
  if (!settings) {
    throw actionError("SVG_SETTINGS_SAVE_FAILED", 500);
  }

  return {
    clueFontBasePt: settings.clueFontBasePt,
    clueFontMinPt: settings.clueFontMinPt,
    clueGlyphWidthPct: settings.clueGlyphWidthPct ?? DEFAULT_SVG_TYPOGRAPHY_PERCENT,
    clueLineHeightPct: settings.clueLineHeightPct ?? DEFAULT_SVG_TYPOGRAPHY_PERCENT,
    fontId: settings.fontId ? String(settings.fontId) : null,
    systemFontFamily: normalizeSystemFontFamily(settings.systemFontFamily),
  };
}

export async function getScanwordFillSettingsAction(input: z.infer<typeof fillSettingsLoadSchema>) {
  const session = await ensureScanwordsAccess();
  const userIdRaw = (session?.user as { id?: string | null } | null)?.id ?? null;
  const userId = userIdRaw ? Number(userIdRaw) : NaN;
  if (!Number.isFinite(userId)) {
    throw actionError("UNAUTHORIZED", 401);
  }
  const data = fillSettingsLoadSchema.parse(input);
  const issueId = BigInt(data.issueId);
  try {
    const settings = await prisma.scanwordFillSettings.findUnique({
      where: { userId_issueId: { userId, issueId } },
      select: {
        speedPreset: true,
        definitionMaxPerCell: true,
        definitionMaxPerHalfCell: true,
      },
    });
    if (!settings) return null;
    return {
      speedPreset: settings.speedPreset,
      definitionMaxPerCell: settings.definitionMaxPerCell,
      definitionMaxPerHalfCell: settings.definitionMaxPerHalfCell,
    };
  } catch (error) {
    if (!isScanwordFillSettingsCompoundKeyValidationError(error)) {
      throw error;
    }
    const rows = await prisma.$queryRaw<
      Array<{
        speedPreset: string;
        definitionMaxPerCell: number | null;
        definitionMaxPerHalfCell: number | null;
      }>
    >`SELECT "speedPreset", "definitionMaxPerCell", "definitionMaxPerHalfCell"
      FROM "public"."scanword_fill_settings"
      WHERE "userId" = ${userId} AND "issueId" = ${issueId}
      ORDER BY "id" DESC
      LIMIT 1`;
    const fallbackSettings = rows[0];
    if (!fallbackSettings) return null;
    return {
      speedPreset: fallbackSettings.speedPreset,
      definitionMaxPerCell: fallbackSettings.definitionMaxPerCell ?? 30,
      definitionMaxPerHalfCell: fallbackSettings.definitionMaxPerHalfCell ?? 15,
    };
  }
}

export async function saveScanwordFillSettingsAction(input: z.infer<typeof fillSettingsSchema>) {
  const session = await ensureScanwordsAccess();
  const userIdRaw = (session?.user as { id?: string | null } | null)?.id ?? null;
  const userId = userIdRaw ? Number(userIdRaw) : NaN;
  if (!Number.isFinite(userId)) {
    throw actionError("UNAUTHORIZED", 401);
  }
  const data = fillSettingsSchema.parse(input);
  const issueId = BigInt(data.issueId);
  try {
    const settings = await prisma.scanwordFillSettings.upsert({
      where: { userId_issueId: { userId, issueId } },
      update: {
        speedPreset: data.speedPreset,
        definitionMaxPerCell: data.definitionMaxPerCell,
        definitionMaxPerHalfCell: data.definitionMaxPerHalfCell,
      },
      create: {
        userId,
        issueId,
        speedPreset: data.speedPreset,
        definitionMaxPerCell: data.definitionMaxPerCell,
        definitionMaxPerHalfCell: data.definitionMaxPerHalfCell,
      },
      select: {
        speedPreset: true,
        definitionMaxPerCell: true,
        definitionMaxPerHalfCell: true,
      },
    });
    return settings;
  } catch (error) {
    if (!isScanwordFillSettingsCompoundKeyValidationError(error)) {
      throw error;
    }
    const rows = await prisma.$queryRaw<
      Array<{
        speedPreset: string;
        definitionMaxPerCell: number | null;
        definitionMaxPerHalfCell: number | null;
      }>
    >`INSERT INTO "public"."scanword_fill_settings" (
        "userId",
        "issueId",
        "speedPreset",
        "definitionMaxPerCell",
        "definitionMaxPerHalfCell"
      )
      VALUES (
        ${userId},
        ${issueId},
        ${data.speedPreset},
        ${data.definitionMaxPerCell},
        ${data.definitionMaxPerHalfCell}
      )
      ON CONFLICT ("userId", "issueId")
      DO UPDATE SET
        "speedPreset" = EXCLUDED."speedPreset",
        "definitionMaxPerCell" = EXCLUDED."definitionMaxPerCell",
        "definitionMaxPerHalfCell" = EXCLUDED."definitionMaxPerHalfCell",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "speedPreset", "definitionMaxPerCell", "definitionMaxPerHalfCell"`;
    const fallbackSettings = rows[0];
    if (!fallbackSettings) {
      throw new Error("Failed to persist scanword fill settings");
    }
    return {
      speedPreset: fallbackSettings.speedPreset,
      definitionMaxPerCell: fallbackSettings.definitionMaxPerCell ?? data.definitionMaxPerCell,
      definitionMaxPerHalfCell: fallbackSettings.definitionMaxPerHalfCell ?? data.definitionMaxPerHalfCell,
    };
  }
}
