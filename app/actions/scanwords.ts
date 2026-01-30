"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { authOptions } from "@/auth";
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

async function ensureScanwordsAccess() {
  const session = await getServerSession(authOptions);
  await requirePermissionAsync(session?.user ?? null, Permissions.AdminAccess);
  return session;
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
        const err = new Error("Duplicate edition");
        (err as Error & { status?: number }).status = 409;
        throw err;
      }
    } else {
      throw e;
    }
  }
  const locale = await getLocale();
  revalidatePath(`/${locale}/scanwords`);
  if (createdId == null) {
    const err = new Error("Failed to create edition");
    (err as Error & { status?: number }).status = 500;
    throw err;
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
      const err = new Error("Duplicate issue");
      (err as Error & { status?: number }).status = 409;
      throw err;
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
