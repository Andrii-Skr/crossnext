import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const MAX_REPORT_BYTES = 64 * 1024;
const MAX_REPORTS_TO_LOG = 20;

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalizeReports(payload: unknown): JsonObject[] {
  if (Array.isArray(payload)) {
    return payload.map((item) => asObject(item)).filter((item): item is JsonObject => Boolean(item));
  }
  const obj = asObject(payload);
  if (!obj) return [];
  const legacy = asObject(obj["csp-report"]);
  if (legacy) return [legacy];
  const body = asObject(obj.body);
  if (body) return [body];
  return [obj];
}

function firstString(report: JsonObject, keys: string[]): string | null {
  for (const key of keys) {
    const value = report[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim().slice(0, 500);
  }
  return null;
}

function firstNumber(report: JsonObject, keys: string[]): number | null {
  for (const key of keys) {
    const value = report[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function sanitizeReports(reports: JsonObject[], userAgent: string | null): JsonObject[] {
  return reports.slice(0, MAX_REPORTS_TO_LOG).map((report) => ({
    documentUri: firstString(report, ["document-uri", "documentURL", "documentUri"]),
    blockedUri: firstString(report, ["blocked-uri", "blockedURL", "blockedUri"]),
    effectiveDirective: firstString(report, ["effective-directive", "effectiveDirective"]),
    violatedDirective: firstString(report, ["violated-directive", "violatedDirective"]),
    disposition: firstString(report, ["disposition"]),
    sourceFile: firstString(report, ["source-file", "sourceFile"]),
    lineNumber: firstNumber(report, ["line-number", "lineNumber"]),
    columnNumber: firstNumber(report, ["column-number", "columnNumber"]),
    statusCode: firstNumber(report, ["status-code", "statusCode"]),
    referrer: firstString(report, ["referrer"]),
    userAgent: userAgent?.slice(0, 300) ?? null,
  }));
}

export async function POST(request: Request) {
  const contentLengthRaw = request.headers.get("content-length");
  const contentLength = contentLengthRaw ? Number.parseInt(contentLengthRaw, 10) : NaN;
  if (Number.isFinite(contentLength) && contentLength > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 204 });
  }

  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 204 });
  }

  const payload = safeParseJson(raw);
  const reports = normalizeReports(payload);
  if (env.CSP_REPORT_LOG && reports.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("CSP report", sanitizeReports(reports, request.headers.get("user-agent")));
  }

  return new NextResponse(null, { status: 204 });
}
