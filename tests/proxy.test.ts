import { NextRequest } from "next/server";
import type { JWT } from "next-auth/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/middleware", () => ({
  __esModule: true,
  default: () => () => null, // no-op intl handling for tests
}));

vi.mock("next-auth/jwt", async (orig) => {
  const actual = await orig();
  return {
    __esModule: true,
    ...actual,
    getToken: vi.fn(),
  };
});

let proxy: typeof import("@/proxy").proxy;
let getTokenMock: ReturnType<typeof vi.fn>;

describe("proxy auth status", () => {
  beforeEach(async () => {
    process.env.NEXTAUTH_SECRET = "averylongtestsecret";
    process.env.CSP_REPORT_ENABLED = "1";
    process.env.CSP_REPORT_ONLY = "0";
    process.env.CSP_REPORT_LOG = "0";
    vi.resetModules();
    const mod = await import("@/proxy");
    proxy = mod.proxy;
    const { getToken } = await import("next-auth/jwt");
    getTokenMock = getToken as unknown as ReturnType<typeof vi.fn>;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const makeRequest = (path: string) => new NextRequest(`http://localhost${path}`);

  it("redirects unauthenticated users to sign-in", async () => {
    getTokenMock.mockResolvedValue(null);
    const res = await proxy(makeRequest("/ru/admin"));
    expect(res.headers.get("location")).toContain("/ru/auth/sign-in");
  });

  it("allows when status endpoint confirms role", async () => {
    getTokenMock.mockResolvedValue({ id: 1, role: "USER", isDeleted: false } as JWT);
    const fetchMock = vi
      .spyOn(global, "fetch" as never)
      .mockResolvedValue(new Response(JSON.stringify({ role: "USER", isDeleted: false }), { status: 200 }));
    const res = await proxy(makeRequest("/ru/admin"));
    expect(res.headers.get("location")).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("redirects when status endpoint reports deleted", async () => {
    getTokenMock.mockResolvedValue({ id: 1, role: "USER", isDeleted: false } as JWT);
    vi.spyOn(global, "fetch" as never).mockResolvedValue(
      new Response(JSON.stringify({ role: "USER", isDeleted: true }), { status: 200 }),
    );
    const res = await proxy(makeRequest("/ru/admin"));
    expect(res.headers.get("location")).toContain("/ru/auth/sign-in");
  });

  it("fails open with cached allow when status endpoint errors", async () => {
    getTokenMock.mockResolvedValue({ id: 1, role: "USER", isDeleted: false } as JWT);
    const fetchMock = vi.spyOn(global, "fetch" as never);
    // First call seeds cache with allow
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ role: "USER", isDeleted: false }), { status: 200 }));
    const first = await proxy(makeRequest("/ru/admin"));
    expect(first.headers.get("location")).toBeNull();
    // Second call simulates status API failure; should rely on cache and allow
    fetchMock.mockRejectedValueOnce(new Error("unreachable"));
    const second = await proxy(makeRequest("/ru/admin"));
    expect(second.headers.get("location")).toBeNull();
  });

  it("sets per-request CSP nonce", async () => {
    getTokenMock.mockResolvedValue(null);
    const first = await proxy(makeRequest("/ru/auth/sign-in"));
    const second = await proxy(makeRequest("/ru/auth/sign-in"));
    const firstCsp = first.headers.get("content-security-policy");
    const secondCsp = second.headers.get("content-security-policy");

    expect(firstCsp).toContain("script-src 'self' 'nonce-");
    expect(firstCsp).toContain("object-src 'none'");
    expect(secondCsp).toContain("script-src 'self' 'nonce-");

    const firstNonce = firstCsp?.match(/'nonce-([^']+)'/)?.[1] ?? null;
    const secondNonce = secondCsp?.match(/'nonce-([^']+)'/)?.[1] ?? null;
    expect(firstNonce).not.toBeNull();
    expect(secondNonce).not.toBeNull();
    expect(firstNonce).not.toBe(secondNonce);
  });

  it("adds CSP reporting headers", async () => {
    getTokenMock.mockResolvedValue(null);
    const res = await proxy(makeRequest("/ru/auth/sign-in"));
    const csp = res.headers.get("content-security-policy");
    expect(csp).toContain("report-uri http://localhost/api/security/csp-report");
    expect(csp).toContain("report-to csp-endpoint");
    expect(res.headers.get("report-to")).toContain('"group":"csp-endpoint"');
    expect(res.headers.get("reporting-endpoints")).toContain("csp-endpoint=");
  });

  it("switches to report-only mode by env", async () => {
    process.env.CSP_REPORT_ONLY = "1";
    vi.resetModules();
    const mod = await import("@/proxy");
    proxy = mod.proxy;
    const { getToken } = await import("next-auth/jwt");
    getTokenMock = getToken as unknown as ReturnType<typeof vi.fn>;
    getTokenMock.mockResolvedValue(null);

    const res = await proxy(makeRequest("/ru/auth/sign-in"));
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("content-security-policy-report-only")).toContain("script-src 'self' 'nonce-");
  });

  it("does not forward next-router-state-tree request header", async () => {
    getTokenMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/ru/auth/sign-in", {
      headers: {
        rsc: "1",
        "next-router-state-tree": "%5B%22%22%2C%7B%7D%5D",
      },
    });

    const res = await proxy(req);
    const overrideHeaders = (res.headers.get("x-middleware-override-headers") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    expect(overrideHeaders).not.toContain("next-router-state-tree");
    expect(res.headers.get("x-middleware-request-next-router-state-tree")).toBeNull();
  });
});
