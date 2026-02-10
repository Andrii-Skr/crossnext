import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { hasPermissionAsync, Permissions } from "@/lib/authz";
import { prisma } from "@/lib/db";

function sanitizeName(name: string) {
  // Drop path components, normalize, and allow Unicode letters/numbers
  const base = path
    .basename(name)
    .replace(/[\r\n\t]/g, " ")
    .trim();
  const normalized = base.normalize("NFC");
  // Allow letters, numbers, marks, space, dash, underscore, dot; replace others with _
  const safe = normalized.replace(/[^\p{L}\p{N}\p{M}\-_. ]+/gu, "_");
  return safe.replace(/_{2,}/g, "_").replace(/ {2,}/g, " ");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function pickUniqueName(dir: string, rawName: string, used: Set<string>): Promise<string> {
  const ext = path.extname(rawName);
  const baseRaw = ext ? rawName.slice(0, -ext.length) : rawName;
  const base = baseRaw.length > 0 ? baseRaw : "file";
  let candidate = `${base}${ext}`;
  let counter = 2;
  while (used.has(candidate) || (await fileExists(path.join(dir, candidate)))) {
    candidate = `${base}_${counter}${ext}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

async function hasActiveFillJob(issueId: bigint): Promise<boolean> {
  try {
    const row = await prisma.scanwordFillJob.findFirst({
      where: {
        issueId,
        status: {
          in: ["queued", "running", "review"],
        },
      },
      select: { id: true },
    });
    return Boolean(row);
  } catch (err: unknown) {
    // Table may not exist in environments where migrations haven't been applied yet.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
      return false;
    }
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string | null } | null)?.role ?? null;
    const allowed = await hasPermissionAsync(role, Permissions.DictionaryWrite);
    if (!session || !allowed) {
      return new NextResponse("Unauthorized", { status: session ? 403 : 401 });
    }

    const form = await req.formData();
    const issueIdRaw = form.get("issueId");
    let issueId: bigint | null = null;
    if (typeof issueIdRaw === "string" && issueIdRaw.trim().length > 0) {
      try {
        issueId = BigInt(issueIdRaw.trim());
      } catch {
        return new NextResponse("Invalid issueId", { status: 400 });
      }
    }
    const incoming = form.getAll("files");
    const files = incoming.filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return new NextResponse("No files", { status: 400 });
    }

    const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per file

    const baseDir = process.env.CROSS_SAMPLES_DIR;
    if (!baseDir) {
      return new NextResponse("CROSS_SAMPLES_DIR is not configured", { status: 500 });
    }
    let dest = baseDir;
    if (issueId) {
      const issue = await prisma.issue.findUnique({
        where: { id: issueId },
        select: {
          edition: { select: { code: true } },
          issueNumber: { select: { label: true } },
        },
      });
      if (!issue) {
        return new NextResponse("Issue not found", { status: 404 });
      }
      if (await hasActiveFillJob(issueId)) {
        return new NextResponse("Generation is running for this issue", { status: 409 });
      }
      const editionDir = sanitizeName(issue.edition.code);
      const issueDir = sanitizeName(issue.issueNumber.label);
      dest = path.join(baseDir, editionDir, issueDir);
      await fs.rm(dest, { recursive: true, force: true });
    }
    await fs.mkdir(dest, { recursive: true });

    const usedNames = new Set<string>();
    const saved: { name: string; size: number }[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        return new NextResponse("File too large", { status: 413 });
      }
      const buf = Buffer.from(await f.arrayBuffer());
      const name = await pickUniqueName(dest, sanitizeName(f.name || "file"), usedNames);
      const target = path.join(dest, name);
      await fs.writeFile(target, buf);
      saved.push({ name, size: buf.length });
    }

    return NextResponse.json({ ok: true, saved, dest });
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || "Error";
    return new NextResponse(msg, { status: 500 });
  }
}
