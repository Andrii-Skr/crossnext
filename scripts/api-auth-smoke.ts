import fs from "node:fs";
import path from "node:path";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type Probe = {
  name: string;
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  expectedStatuses?: number[];
};

type ProbeResult = {
  probe: Probe;
  ok: boolean;
  status: number | null;
  message: string;
};

const DEFAULT_EXPECTED_UNAUTHORIZED = [401, 403];
const DEFAULT_TIMEOUT_MS = 12_000;
const PUBLIC_ROUTE_ALLOWLIST = new Set(["app/api/auth/[...nextauth]/route.ts", "app/api/healthz/route.ts"]);

const probes: Probe[] = [
  { name: "auth/status GET", method: "GET", path: "/api/auth/status", expectedStatuses: [401] },
  { name: "languages GET", method: "GET", path: "/api/languages" },
  { name: "difficulties GET", method: "GET", path: "/api/difficulties" },
  { name: "tags GET", method: "GET", path: "/api/tags" },
  { name: "tags POST", method: "POST", path: "/api/tags", body: { name: "auth-smoke-tag" } },
  { name: "tag PUT", method: "PUT", path: "/api/tags/1", body: { name: "auth-smoke-tag-upd" } },
  { name: "tag DELETE", method: "DELETE", path: "/api/tags/1" },
  { name: "dictionary list GET", method: "GET", path: "/api/dictionary" },
  { name: "dictionary word GET", method: "GET", path: "/api/dictionary/word/1" },
  { name: "dictionary word PUT", method: "PUT", path: "/api/dictionary/word/1", body: { word_text: "ТЕСТ" } },
  { name: "dictionary word DELETE", method: "DELETE", path: "/api/dictionary/word/1" },
  { name: "dictionary word restore POST", method: "POST", path: "/api/dictionary/word/1/restore", body: {} },
  { name: "dictionary def PUT", method: "PUT", path: "/api/dictionary/def/1", body: { text_opr: "Тест" } },
  { name: "dictionary def DELETE", method: "DELETE", path: "/api/dictionary/def/1" },
  { name: "dictionary def restore POST", method: "POST", path: "/api/dictionary/def/1/restore", body: {} },
  { name: "dictionary def tags GET", method: "GET", path: "/api/dictionary/def/1/tags" },
  { name: "dictionary def tags POST", method: "POST", path: "/api/dictionary/def/1/tags", body: { tagId: 1 } },
  {
    name: "dictionary def tags DELETE",
    method: "DELETE",
    path: "/api/dictionary/def/1/tags",
    query: { tagId: 1 },
  },
  { name: "dictionary def end-date GET", method: "GET", path: "/api/dictionary/def/1/end-date" },
  {
    name: "dictionary def end-date PUT",
    method: "PUT",
    path: "/api/dictionary/def/1/end-date",
    body: { end_date: null },
  },
  {
    name: "dictionary def difficulty PUT",
    method: "PUT",
    path: "/api/dictionary/def/1/difficulty",
    body: { difficulty: 1 },
  },
  { name: "dictionary templates GET", method: "GET", path: "/api/dictionary/templates" },
  {
    name: "dictionary templates POST",
    method: "POST",
    path: "/api/dictionary/templates",
    body: { name: "auth-smoke-template", filter: { language: "ru" } },
  },
  {
    name: "dictionary filter-stats POST",
    method: "POST",
    path: "/api/dictionary/filter-stats",
    body: { language: "ru" },
  },
  {
    name: "dictionary bulk-tags POST",
    method: "POST",
    path: "/api/dictionary/bulk-tags",
    body: { action: "applyTags", tagIds: [1], ids: ["1"] },
  },
  {
    name: "dictionary definitions-difficulty POST",
    method: "POST",
    path: "/api/dictionary/definitions-difficulty",
    body: { ids: ["1"] },
  },
  { name: "pending count GET", method: "GET", path: "/api/pending/count" },
  {
    name: "pending create POST",
    method: "POST",
    path: "/api/pending/create",
    body: { wordId: "1", definition: "Тест", language: "ru" },
  },
  {
    name: "pending create-new POST",
    method: "POST",
    path: "/api/pending/create-new",
    body: { word: "ТЕСТ", definition: "Тест", language: "ru" },
  },
  {
    name: "scanwords fill-review-draft GET",
    method: "GET",
    path: "/api/scanwords/fill-review-draft",
    query: { jobId: "1" },
  },
  {
    name: "scanwords fill-review-draft PUT",
    method: "PUT",
    path: "/api/scanwords/fill-review-draft",
    body: { jobId: "1", rows: [] },
  },
  {
    name: "scanwords fill-review-draft DELETE",
    method: "DELETE",
    path: "/api/scanwords/fill-review-draft",
    query: { jobId: "1" },
  },
  { name: "upload samples POST", method: "POST", path: "/api/upload/samples" },
  { name: "ai generate-definition GET", method: "GET", path: "/api/ai/generate-definition" },
  {
    name: "ai generate-definition POST",
    method: "POST",
    path: "/api/ai/generate-definition",
    body: { word: "ТЕСТ", language: "ru", existing: [], maxLength: 120 },
  },
];

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function formatPathWithQuery(probe: Probe): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(probe.query ?? {})) {
    if (value === null || value === undefined) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${probe.path}?${query}` : probe.path;
}

function buildUrl(baseUrl: string, probe: Probe): string {
  return `${baseUrl}${formatPathWithQuery(probe)}`;
}

function toShortText(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}...`;
}

async function runProbe(baseUrl: string, probe: Probe, timeoutMs: number): Promise<ProbeResult> {
  const url = buildUrl(baseUrl, probe);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: HeadersInit = { Accept: "application/json" };
    let body: string | undefined;
    if (probe.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(probe.body);
    }

    const res = await fetch(url, {
      method: probe.method,
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
    const expected = probe.expectedStatuses ?? DEFAULT_EXPECTED_UNAUTHORIZED;
    const ok = expected.includes(res.status);
    const location = res.headers.get("location");
    let details = location ? `location=${location}` : "";
    if (!ok) {
      const text = toShortText(await res.text());
      details = [details, text].filter(Boolean).join("; ");
    }

    return {
      probe,
      ok,
      status: res.status,
      message: details || "no response body",
    };
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      probe,
      ok: false,
      status: null,
      message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function collectRouteFiles(dir: string, acc: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRouteFiles(full, acc);
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") {
      acc.push(full);
    }
  }
  return acc;
}

function hasAuthGuard(content: string): boolean {
  return (
    /requireAuth\s*:\s*true/.test(content) ||
    /getServerSession\s*\(/.test(content) ||
    /getToken\s*\(/.test(content) ||
    /NextAuth\s*\(/.test(content)
  );
}

function runStaticAudit(projectRoot: string): { ok: boolean; missing: string[] } {
  const apiDir = path.join(projectRoot, "app/api");
  const routeFiles = collectRouteFiles(apiDir);
  const missing: string[] = [];
  for (const fullPath of routeFiles) {
    const rel = path.relative(projectRoot, fullPath).replaceAll(path.sep, "/");
    if (PUBLIC_ROUTE_ALLOWLIST.has(rel)) continue;
    const content = fs.readFileSync(fullPath, "utf8");
    if (!hasAuthGuard(content)) {
      missing.push(rel);
    }
  }
  return { ok: missing.length === 0, missing };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const staticOnly = args.has("--static-only");
  const runtimeOnly = args.has("--runtime-only");
  if (staticOnly && runtimeOnly) {
    throw new Error("Choose only one mode: --static-only or --runtime-only");
  }

  const runStatic = !runtimeOnly;
  const runRuntime = !staticOnly;
  const projectRoot = process.cwd();
  const baseUrl = normalizeBaseUrl(
    process.env.AUTH_SMOKE_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  );
  const timeoutMsRaw = Number(process.env.AUTH_SMOKE_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? Math.trunc(timeoutMsRaw) : DEFAULT_TIMEOUT_MS;

  let hasFailures = false;

  if (runStatic) {
    console.log("== Static auth audit ==");
    const audit = runStaticAudit(projectRoot);
    if (audit.ok) {
      console.log(
        `PASS: all non-public routes have an auth guard (${PUBLIC_ROUTE_ALLOWLIST.size} public allowlisted).`,
      );
    } else {
      hasFailures = true;
      console.log("FAIL: routes without auth guard:");
      for (const file of audit.missing) {
        console.log(`- ${file}`);
      }
    }
  }

  if (runRuntime) {
    console.log("\n== Runtime auth smoke ==");
    console.log(`Base URL: ${baseUrl}`);
    const results: ProbeResult[] = [];
    for (const probe of probes) {
      const result = await runProbe(baseUrl, probe, timeoutMs);
      results.push(result);
      const statusText = result.status == null ? "ERR" : String(result.status);
      const marker = result.ok ? "PASS" : "FAIL";
      console.log(`${marker} ${statusText} ${probe.method} ${formatPathWithQuery(probe)} (${probe.name})`);
      if (!result.ok) {
        console.log(`  ${result.message}`);
      }
    }

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
      hasFailures = true;
      console.log(`\nRuntime failures: ${failed.length}/${results.length}`);
    } else {
      console.log(`\nPASS: ${results.length}/${results.length} endpoints rejected unauthenticated access.`);
    }
  }

  if (hasFailures) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`api-auth-smoke failed: ${message}`);
  process.exit(1);
});
