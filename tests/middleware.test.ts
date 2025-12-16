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

let middleware: typeof import("@/middleware").middleware;
let getTokenMock: ReturnType<typeof vi.fn>;

describe("middleware auth status", () => {
  beforeEach(async () => {
    process.env.NEXTAUTH_SECRET = "averylongtestsecret";
    vi.resetModules();
    const mod = await import("@/middleware");
    middleware = mod.middleware;
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
    const res = await middleware(makeRequest("/ru/admin"));
    expect(res.headers.get("location")).toContain("/ru/auth/sign-in");
  });

  it("allows when status endpoint confirms role", async () => {
    getTokenMock.mockResolvedValue({ id: 1, role: "USER", isDeleted: false } as JWT);
    const fetchMock = vi
      .spyOn(global, "fetch" as never)
      .mockResolvedValue(new Response(JSON.stringify({ role: "USER", isDeleted: false }), { status: 200 }));
    const res = await middleware(makeRequest("/ru/admin"));
    expect(res.headers.get("location")).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("redirects when status endpoint reports deleted", async () => {
    getTokenMock.mockResolvedValue({ id: 1, role: "USER", isDeleted: false } as JWT);
    vi.spyOn(global, "fetch" as never).mockResolvedValue(
      new Response(JSON.stringify({ role: "USER", isDeleted: true }), { status: 200 }),
    );
    const res = await middleware(makeRequest("/ru/admin"));
    expect(res.headers.get("location")).toContain("/ru/auth/sign-in");
  });

  it("fails open with cached allow when status endpoint errors", async () => {
    getTokenMock.mockResolvedValue({ id: 1, role: "USER", isDeleted: false } as JWT);
    const fetchMock = vi.spyOn(global, "fetch" as never);
    // First call seeds cache with allow
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ role: "USER", isDeleted: false }), { status: 200 }));
    const first = await middleware(makeRequest("/ru/admin"));
    expect(first.headers.get("location")).toBeNull();
    // Second call simulates status API failure; should rely on cache and allow
    fetchMock.mockRejectedValueOnce(new Error("unreachable"));
    const second = await middleware(makeRequest("/ru/admin"));
    expect(second.headers.get("location")).toBeNull();
  });
});
