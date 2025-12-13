import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { hasPermissionAsync, Permissions } from "@/lib/authz";

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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string | null } | null)?.role ?? null;
    const allowed = await hasPermissionAsync(role, Permissions.DictionaryWrite);
    if (!session || !allowed) {
      return new NextResponse("Unauthorized", { status: session ? 403 : 401 });
    }

    const form = await req.formData();
    const incoming = form.getAll("files");
    const files = incoming.filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return new NextResponse("No files", { status: 400 });
    }

    const MAX_FILES = 10;
    const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per file
    if (files.length > MAX_FILES) {
      return new NextResponse("Too many files", { status: 400 });
    }

    const dest = process.env.CROSS_SAMPLES_DIR || path.resolve(process.cwd(), "var/crosswords/sample");
    await fs.mkdir(dest, { recursive: true });

    const saved: { name: string; size: number }[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        return new NextResponse("File too large", { status: 413 });
      }
      const buf = Buffer.from(await f.arrayBuffer());
      const name = sanitizeName(f.name || "file");
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
