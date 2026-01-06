import type { GenerateInput, ProviderResult } from "@/lib/ai/types";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const deepGet = (obj: unknown, path: Array<string | number>): unknown => {
  let cur: unknown = obj;
  for (const key of path) {
    if (Array.isArray(cur) && typeof key === "number") cur = cur[key];
    else if (isObject(cur) && typeof key === "string") cur = cur[key];
    else return undefined;
  }
  return cur;
};

export async function generateWithOpenAI(
  input: GenerateInput,
  opts: {
    baseUrl: string;
    apiKey?: string;
    model: string;
    extraHeaders?: Record<string, string>;
    systemText: string;
    userText: string;
    path?: string; // default /v1/chat/completions
    authHeader?: string; // default Authorization
    authScheme?: string | null; // default Bearer (null/empty => no scheme)
    timeoutMs?: number;
  },
): Promise<ProviderResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.extraHeaders || {}),
  };
  if (opts.apiKey) {
    const h = opts.authHeader || "Authorization";
    const s = opts.authScheme ?? "Bearer";
    headers[h] = `${s ? `${s} ` : ""}${opts.apiKey}`;
  }

  const path = opts.path || "/v1/chat/completions";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Math.max(1000, opts.timeoutMs ?? 20000));
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: opts.systemText },
          { role: "user", content: opts.userText },
        ],
        temperature: 0.7,
        max_tokens: Math.max(24, Math.min(300, Math.ceil(input.maxLength * 1.5))),
      }),
      signal: ac.signal,
    });
  } catch (e: unknown) {
    clearTimeout(timer);
    const msg =
      (e as Error)?.name === "AbortError"
        ? "OpenAI request timed out"
        : (e as Error)?.message || "OpenAI request failed";
    return { ok: false, message: msg, status: (e as Error)?.name === "AbortError" ? 504 : 502 };
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      message: text || `Upstream error ${res.status}`,
      status: res.status === 429 ? 429 : 502,
    };
  }
  const data: unknown = await res.json();
  const content = deepGet(data, ["choices", 0, "message", "content"]);
  const text: string = typeof content === "string" ? content : String((content as unknown) ?? "");
  if (!text) return { ok: false, message: "Empty response", status: 500 };
  return { ok: true, text };
}
