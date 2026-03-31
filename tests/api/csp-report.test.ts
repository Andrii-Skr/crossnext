import { describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/security/csp-report/route";

describe("/api/security/csp-report", () => {
  it("accepts legacy csp-report payload", async () => {
    const req = new Request("http://localhost/api/security/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: JSON.stringify({
        "csp-report": {
          "document-uri": "http://localhost/ru/dictionary",
          "blocked-uri": "inline",
          "effective-directive": "script-src",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(204);
  });

  it("accepts reporting API array payload", async () => {
    const req = new Request("http://localhost/api/security/csp-report", {
      method: "POST",
      headers: { "content-type": "application/reports+json" },
      body: JSON.stringify([
        {
          type: "csp-violation",
          body: {
            documentURL: "http://localhost/ru/dictionary",
            blockedURL: "inline",
            effectiveDirective: "script-src",
          },
        },
      ]),
    });

    const res = await POST(req);
    expect(res.status).toBe(204);
  });

  it("logs sanitized report when CSP_REPORT_LOG is enabled", async () => {
    process.env.CSP_REPORT_LOG = "1";
    vi.resetModules();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { POST: postWithLog } = await import("../../app/api/security/csp-report/route");
    const req = new Request("http://localhost/api/security/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report", "user-agent": "vitest-agent" },
      body: JSON.stringify({
        "csp-report": {
          "document-uri": "http://localhost/ru/dictionary",
          "blocked-uri": "inline",
          "effective-directive": "script-src",
        },
      }),
    });

    const res = await postWithLog(req);
    expect(res.status).toBe(204);
    expect(warnSpy).toHaveBeenCalledWith(
      "CSP report",
      expect.arrayContaining([
        expect.objectContaining({
          effectiveDirective: "script-src",
          blockedUri: "inline",
          userAgent: "vitest-agent",
        }),
      ]),
    );
    warnSpy.mockRestore();
    process.env.CSP_REPORT_LOG = "0";
  });
});
