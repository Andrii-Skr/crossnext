import { NextResponse } from "next/server";
import { z } from "zod";
import { Permissions } from "@/lib/authz";
import { apiRoute } from "@/utils/appRoute";

const slotSchema = z.object({
  slotId: z.number().int().nonnegative(),
  word: z.string().min(1).max(64),
  definition: z.string().min(1).max(1024),
  wordId: z.string().min(1).max(32).nullable(),
  opredId: z.string().min(1).max(32).nullable(),
});

const templateSchema = z.object({
  key: z.string().min(1).max(128),
  slots: z.array(slotSchema).max(10000),
});

const finalizePayloadSchema = z.object({
  templates: z.array(templateSchema).min(1).max(200),
});

const schema = z.object({
  jobId: z.string().min(1),
  payload: finalizePayloadSchema,
});

type Body = z.infer<typeof schema>;

function crossApiBase(): string {
  return (process.env.CROSS_API_URL || process.env.NEXT_PUBLIC_CROSS_API_URL || "http://localhost:3001").replace(
    /\/$/,
    "",
  );
}

function parseJsonSafe(raw: string): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export const POST = apiRoute<Body>(
  async (_req, body) => {
    const upstreamUrl = `${crossApiBase()}/api/fill/${encodeURIComponent(body.jobId)}/finalize`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body.payload),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Finalize request timed out"
          : error instanceof Error
            ? error.message
            : "Failed to reach fill service";
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }

    const text = await upstream.text().catch(() => "");
    const json = parseJsonSafe(text);

    if (json && typeof json === "object") {
      return NextResponse.json(json, { status: upstream.status });
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          success: false,
          error: text || `HTTP ${upstream.status}`,
        },
        { status: upstream.status || 502 },
      );
    }

    return NextResponse.json({ success: true });
  },
  {
    schema,
    requireAuth: true,
    permissions: [Permissions.DictionaryWrite],
  },
);
