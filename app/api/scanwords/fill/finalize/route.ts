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

function errorResponse(status: number, message: string, errorCode: string) {
  return NextResponse.json({ success: false, message, errorCode }, { status });
}

function crossApiBases(): string[] {
  const configured = [process.env.CROSS_API_URL, process.env.NEXT_PUBLIC_CROSS_API_URL]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
    .map((value) => value.replace(/\/$/, ""));
  const fallbacks = [
    "http://cross:3001",
    "http://host.docker.internal:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
  ];
  return [...new Set([...configured, ...fallbacks])];
}

function parseJsonSafe(raw: string): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function extractMessageFromPayload(payload: unknown): string | null {
  const obj = asObject(payload);
  if (!obj) return null;
  const message = typeof obj.message === "string" && obj.message.trim().length > 0 ? obj.message : null;
  if (message) return message;
  const error = typeof obj.error === "string" && obj.error.trim().length > 0 ? obj.error : null;
  return error;
}

function extractErrorCodeFromPayload(payload: unknown): string | null {
  const obj = asObject(payload);
  if (!obj) return null;
  return typeof obj.errorCode === "string" && obj.errorCode.trim().length > 0 ? obj.errorCode : null;
}

function upstreamErrorCodeByStatus(status: number): string {
  switch (status) {
    case 400:
      return "UPSTREAM_BAD_REQUEST";
    case 401:
      return "UPSTREAM_UNAUTHORIZED";
    case 403:
      return "UPSTREAM_FORBIDDEN";
    case 404:
      return "UPSTREAM_NOT_FOUND";
    case 409:
      return "UPSTREAM_CONFLICT";
    case 422:
      return "UPSTREAM_UNPROCESSABLE_ENTITY";
    case 429:
      return "UPSTREAM_RATE_LIMITED";
    default:
      return "UPSTREAM_ERROR";
  }
}

export const POST = apiRoute<Body>(
  async (_req, body) => {
    const upstreamTargets = crossApiBases();
    let upstream: Response | null = null;
    let lastNetworkError: unknown = null;

    for (const upstreamBase of upstreamTargets) {
      const upstreamUrl = `${upstreamBase}/api/fill/${encodeURIComponent(body.jobId)}/finalize`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        upstream = await fetch(upstreamUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body.payload),
          cache: "no-store",
          signal: controller.signal,
        });
        break;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return errorResponse(504, "Finalize request timed out", "UPSTREAM_TIMEOUT");
        }
        lastNetworkError = error;
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!upstream) {
      const message = lastNetworkError instanceof Error ? lastNetworkError.message : "Failed to reach fill service";
      return errorResponse(502, message, "UPSTREAM_UNAVAILABLE");
    }

    const text = await upstream.text().catch(() => "");
    const json = parseJsonSafe(text);

    if (!upstream.ok) {
      const status = upstream.status || 502;
      const message = (extractMessageFromPayload(json) ?? text) || `HTTP ${upstream.status}`;
      const errorCode = extractErrorCodeFromPayload(json) ?? upstreamErrorCodeByStatus(status);
      return errorResponse(status, message, errorCode);
    }

    if (json && typeof json === "object") {
      return NextResponse.json(json, { status: upstream.status });
    }

    return NextResponse.json({ success: true });
  },
  {
    schema,
    requireAuth: true,
    permissions: [Permissions.DictionaryWrite],
  },
);
