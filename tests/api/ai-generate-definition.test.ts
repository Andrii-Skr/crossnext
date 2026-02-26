vi.mock("@/auth", () => ({ authOptions: {} as unknown }));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/ai/generate-definition/route";
import { resetMocks, setAuthed } from "../mocks";
import { makeCtx, makeReq, readJson } from "./_utils";

const ENV_KEYS = [
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_API_KEY",
  "AI_REQUIRE_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_API_KEY",
  "NVIDIA_API_KEY",
  "NVIDIA_MODEL",
  "NVIDIA_BASE_URL",
  "NVIDIA_PATH",
  "NVIDIA_AUTH_HEADER",
  "NVIDIA_AUTH_SCHEME",
] as const;

describe("/api/ai/generate-definition (POST)", () => {
  const envSnapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetMocks();
    setAuthed({ id: "u-ai", role: "ADMIN" });
    for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = envSnapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it("uses NVIDIA as default provider and sends expected request payload", async () => {
    delete process.env.AI_PROVIDER;
    process.env.AI_REQUIRE_API_KEY = "true";
    process.env.NVIDIA_API_KEY = "nvapi-test";
    delete process.env.NVIDIA_MODEL;

    const fetchMock = vi
      .spyOn(global, "fetch" as never)
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "краткое определение" } }] }), { status: 200 }),
      );

    const req = makeReq("POST", "http://localhost/api/ai/generate-definition", {
      word: "слово",
      language: "ru",
      existing: [],
      maxLength: 48,
    });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{ success: boolean; text: string }>(res);

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.text).toBe("краткое определение");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer nvapi-test");

    const body = JSON.parse(String(init.body)) as {
      model: string;
      stream: boolean;
      temperature: number;
      top_p: number;
    };
    expect(body.model).toBe("google/gemma-3n-e4b-it");
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0.2);
    expect(body.top_p).toBe(0.7);
  });

  it("returns 400 for NVIDIA when API key is missing", async () => {
    process.env.AI_PROVIDER = "nvidia";
    process.env.AI_REQUIRE_API_KEY = "true";
    delete process.env.NVIDIA_API_KEY;
    delete process.env.AI_API_KEY;

    const fetchMock = vi
      .spyOn(global, "fetch" as never)
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "noop" } }] }), { status: 200 }),
      );

    const req = makeReq("POST", "http://localhost/api/ai/generate-definition", {
      word: "слово",
      language: "ru",
      existing: [],
      maxLength: 40,
    });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{ success: boolean; message: string }>(res);

    expect(status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.message).toBe("AI provider is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers OPENAI_MODEL over AI_MODEL when provider=openai", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_REQUIRE_API_KEY = "true";
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_MODEL = "google/gemma-3n-e4b-it";
    process.env.OPENAI_MODEL = "gpt-4o-mini";

    const fetchMock = vi
      .spyOn(global, "fetch" as never)
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "openai answer" } }] }), { status: 200 }),
      );

    const req = makeReq("POST", "http://localhost/api/ai/generate-definition", {
      word: "river",
      language: "en",
      existing: [],
      maxLength: 60,
    });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{ success: boolean; text: string }>(res);

    expect(status).toBe(200);
    expect(json.success).toBe(true);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { model: string };
    expect(body.model).toBe("gpt-4o-mini");
  });
});
