import type { GenerateInput, ProviderResult } from "@/lib/ai/types";

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const deepGet = (obj: unknown, path: Array<string | number>): unknown => {
  let cur: unknown = obj;
  for (const key of path) {
    if (Array.isArray(cur) && typeof key === "number") cur = cur[key];
    else if (isObject(cur) && typeof key === "string") cur = cur[key];
    else return undefined;
  }
  return cur;
};

export async function generateWithAnthropic(
  input: GenerateInput,
  opts: {
    apiKey?: string;
    model: string;
    version?: string; // default 2023-06-01
    extraHeaders?: Record<string, string>;
    systemText: string;
    userText: string;
    timeoutMs?: number;
  },
): Promise<ProviderResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Math.max(1000, opts.timeoutMs ?? 20000));
  let res: Response;
  try {
    res = await fetch(`https://api.anthropic.com/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": String(opts.apiKey ?? ""),
        "anthropic-version": opts.version || "2023-06-01",
        ...(opts.extraHeaders || {}),
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: Math.max(64, Math.min(300, Math.ceil(input.maxLength * 1.5))),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `${opts.systemText}\n\n${opts.userText}` },
            ],
          },
        ],
      }),
      signal: ac.signal,
    });
  } catch (e: unknown) {
    clearTimeout(timer);
    const msg = (e as Error)?.name === "AbortError" ? "Anthropic request timed out" : (e as Error)?.message || "Anthropic request failed";
    return { ok: false, message: msg, status: (e as Error)?.name === "AbortError" ? 504 : 502 };
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, message: text || `Upstream error ${res.status}`, status: 502 };
  }
  const data: unknown = await res.json();
  const textRaw = deepGet(data, ["content", 0, "text"]);
  const text = typeof textRaw === "string" ? textRaw : String((textRaw as unknown) ?? "");
  if (!text) return { ok: false, message: "Empty response", status: 500 };
  return { ok: true, text: String(text) };
}
