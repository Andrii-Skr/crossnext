import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { hasPermissionAsync, Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";

function error(status: number, message: string, errorCode: string) {
  return NextResponse.json({ success: false, message, errorCode }, { status });
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

function sanitizeName(name: string) {
  const base = path
    .basename(name)
    .replace(/[\r\n\t]/g, " ")
    .trim();
  const normalized = base.normalize("NFC");
  const safe = normalized.replace(/[^\p{L}\p{N}\p{M}\-_. ]+/gu, "_");
  return safe.replace(/_{2,}/g, "_").replace(/ {2,}/g, " ");
}

function sanitizeFamilyName(value: string | null | undefined, fallback: string): string {
  const raw = typeof value === "string" ? value : "";
  const normalized = raw
    .replace(/[\r\n\t]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return normalized.length > 0 ? normalized.slice(0, 120) : fallback.slice(0, 120);
}

function resolveFontsDir(): string {
  const explicit = process.env.CROSS_FONTS_DIR?.trim();
  if (explicit) return explicit;

  const samples = process.env.CROSS_SAMPLES_DIR?.trim();
  if (samples) {
    return path.join(path.dirname(samples), "fonts");
  }

  return path.resolve(process.cwd(), "var/crosswords/fonts");
}

function resolveFontFormat(
  fileName: string,
  mimeType: string,
): {
  ext: ".ttf" | ".otf" | ".woff" | ".woff2";
  format: "ttf" | "otf" | "woff" | "woff2";
  mimeType: string;
} | null {
  const extRaw = path.extname(fileName).toLowerCase();
  const ext = extRaw === ".ttf" || extRaw === ".otf" || extRaw === ".woff" || extRaw === ".woff2" ? extRaw : null;
  if (!ext) return null;

  const mimeByExt: Record<string, string> = {
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  const formatByExt: Record<string, "ttf" | "otf" | "woff" | "woff2"> = {
    ".ttf": "ttf",
    ".otf": "otf",
    ".woff": "woff",
    ".woff2": "woff2",
  };
  const normalizedMime = mimeType.trim().toLowerCase();
  const fallbackMime = mimeByExt[ext];
  const acceptedMimes = new Set([
    "application/font-woff",
    "application/font-woff2",
    "application/font-sfnt",
    "application/octet-stream",
    "font/ttf",
    "font/otf",
    "font/woff",
    "font/woff2",
  ]);
  return {
    ext,
    format: formatByExt[ext],
    mimeType: normalizedMime && acceptedMimes.has(normalizedMime) ? normalizedMime : fallbackMime,
  };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string | null } | null)?.role ?? null;
    const allowed = await hasPermissionAsync(role, Permissions.AdminAccess);
    if (!session || !allowed) {
      return error(session ? 403 : 401, "Unauthorized", "UPLOAD_UNAUTHORIZED");
    }

    const form = await req.formData();
    const entry = form.get("file");
    const file = entry instanceof File ? entry : null;
    if (!file) {
      return error(400, "No font file", "UPLOAD_NO_FILE");
    }

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
    if (file.size <= 0) {
      return error(400, "Empty file", "UPLOAD_EMPTY_FILE");
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return error(413, "Font file too large", "UPLOAD_FILE_TOO_LARGE");
    }

    const originalName = sanitizeName(file.name || "font.ttf");
    const formatMeta = resolveFontFormat(originalName, file.type || "");
    if (!formatMeta) {
      return error(400, "Unsupported font format", "UPLOAD_UNSUPPORTED_FORMAT");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const storageFileName = `${sha256}${formatMeta.ext}`;
    const fontsDir = resolveFontsDir();
    await fs.mkdir(fontsDir, { recursive: true });
    const targetPath = path.join(fontsDir, storageFileName);
    try {
      await fs.access(targetPath);
    } catch {
      await fs.writeFile(targetPath, bytes);
    }

    const displayNameRaw = form.get("displayName");
    const familyNameRaw = form.get("familyName");
    const baseDisplayName = path.basename(originalName, path.extname(originalName)).trim() || originalName;
    const displayName = sanitizeFamilyName(
      typeof displayNameRaw === "string" ? displayNameRaw : baseDisplayName,
      baseDisplayName,
    );
    const familyName = sanitizeFamilyName(typeof familyNameRaw === "string" ? familyNameRaw : displayName, displayName);
    const createdByRaw = (session.user as { id?: string | null } | null)?.id ?? null;
    const createdByParsed = createdByRaw ? Number(createdByRaw) : NaN;
    const createdBy = Number.isFinite(createdByParsed) ? Math.trunc(createdByParsed) : null;

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
      INSERT INTO "public"."scanword_svg_fonts"
        ("displayName", "familyName", "format", "mimeType", "fileName", "storageRelPath", "sha256", "sizeBytes", "createdBy")
      VALUES
        (${displayName}, ${familyName}, ${formatMeta.format}, ${formatMeta.mimeType}, ${originalName}, ${storageFileName}, ${sha256}, ${BigInt(bytes.byteLength)}, ${createdBy})
      ON CONFLICT ("sha256")
      DO UPDATE SET
        "displayName" = EXCLUDED."displayName",
        "familyName" = EXCLUDED."familyName",
        "format" = EXCLUDED."format",
        "mimeType" = EXCLUDED."mimeType",
        "fileName" = EXCLUDED."fileName",
        "storageRelPath" = EXCLUDED."storageRelPath",
        "sizeBytes" = EXCLUDED."sizeBytes",
        "updatedAt" = NOW()
      RETURNING
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
    `);
    const font = rows[0];
    if (!font) {
      return error(500, "Failed to save font", "UPLOAD_DB_WRITE_FAILED");
    }

    return NextResponse.json({
      success: true,
      font: {
        id: String(font.id),
        displayName: font.displayName,
        familyName: font.familyName,
        format: font.format,
        mimeType: font.mimeType,
        fileName: font.fileName,
        sha256: font.sha256,
        sizeBytes: Number(font.sizeBytes),
        createdAt: font.createdAt.toISOString(),
        updatedAt: font.updatedAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    if (isMissingTableError(err)) {
      return error(503, "Font storage table is not available", "UPLOAD_DB_NOT_READY");
    }
    return error(500, "Internal server error", "UPLOAD_INTERNAL_ERROR");
  }
}
