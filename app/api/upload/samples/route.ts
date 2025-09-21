import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

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
    const form = await req.formData();
    const incoming = form.getAll("files");
    const files = incoming.filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return new NextResponse("No files", { status: 400 });
    }

    const dest =
      process.env.CROSS_SAMPLES_DIR ||
      path.resolve(process.cwd(), "var/crosswords/sample");
    await fs.mkdir(dest, { recursive: true });

    const saved: { name: string; size: number }[] = [];
    for (const f of files) {
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
