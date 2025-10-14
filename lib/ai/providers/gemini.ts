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

export async function generateWithGemini(
  input: GenerateInput,
  opts: {
    baseUrl: string;
    apiKey?: string; // header or query
    model: string;
    fallbackModel?: string;
    pathTemplate?: string; // GEMINI_PATH (can contain <model>)
    authHeader?: string; // when provided, use header instead of ?key=
    extraHeaders?: Record<string, string>;
    systemText: string;
    userText: string;
    timeoutMs?: number;
  },
): Promise<ProviderResult> {
  const pathFor = (m: string): string => {
    const tpl = opts.pathTemplate?.trim();
    let p = tpl
      ? tpl.includes("<model>")
        ? tpl.replaceAll("<model>", encodeURIComponent(m))
        : tpl
      : `/v1beta/models/${encodeURIComponent(m)}:generateContent`;
    if (!p.startsWith("/")) p = `/${p}`;
    return p;
  };
  const urlFor = (m: string): string => {
    const path = pathFor(m);
    const useHeaderAuth = Boolean(opts.authHeader && opts.apiKey);
    const q = !useHeaderAuth && opts.apiKey ? `?key=${encodeURIComponent(opts.apiKey)}` : "";
    return `${opts.baseUrl.replace(/\/$/, "")}${path}${q}`;
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.extraHeaders || {}),
  };
  if (opts.authHeader && opts.apiKey) headers[opts.authHeader] = opts.apiKey;

  const isVertex =
    /aiplatform\.googleapis\.com/.test(opts.baseUrl) ||
    /\/projects\/[^/]+\/locations\//.test(pathFor(opts.model));
  const maxOutTokens = Math.max(
    256,
    Math.min(2048, Math.ceil(input.maxLength * 4)),
  );
  const makeBody = (userText: string, sysText: string) =>
    JSON.stringify(
      isVertex
        ? {
            systemInstruction: { parts: [{ text: sysText }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
            generationConfig: {
              temperature: 0.7,
              responseMimeType: "text/plain",
              maxOutputTokens: maxOutTokens,
            },
          }
        : {
            system_instruction: { parts: [{ text: sysText }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
            generationConfig: {
              temperature: 0.7,
              response_mime_type: "text/plain",
              maxOutputTokens: maxOutTokens,
            },
          },
    );

  const callOnce = async (model: string, userText: string) => {
    const url = urlFor(model);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), Math.max(1000, opts.timeoutMs ?? 20000));
    try {
      return await fetch(url, {
        method: "POST",
        headers,
        body: makeBody(userText, opts.systemText),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res: Response;
  try {
    res = await callOnce(opts.model, opts.userText);
  } catch (e: unknown) {
    const msg = (e as Error)?.name === "AbortError" ? "Gemini request timed out" : (e as Error)?.message || "Gemini request failed";
    return { ok: false, message: msg, status: (e as Error)?.name === "AbortError" ? 504 : 502 };
  }
  if (!res.ok) {
    const originalErr = await res.text().catch(() => "");
    const fb = opts.fallbackModel || "gemini-2.0-flash";
    if (fb && fb !== opts.model) {
      let resFb: Response;
      try {
        resFb = await callOnce(fb, opts.userText);
      } catch (e: unknown) {
        const fbErrMsg = (e as Error)?.name === "AbortError" ? "timeout" : (e as Error)?.message || "fetch failed";
        return {
          ok: false,
          message: `${originalErr || `Upstream error ${res.status}`} | Fallback: ${fbErrMsg}`,
          status: (e as Error)?.name === "AbortError" ? 504 : 502,
        };
      }
      if (!resFb.ok) {
        const fbErr = await resFb.text().catch(() => "");
        return {
          ok: false,
          message:
            (originalErr || `Upstream error ${res.status}`) + (fbErr ? ` | Fallback: ${fbErr}` : ""),
          status: 502,
        };
      }
      res = resFb;
    } else {
      return { ok: false, message: originalErr || `Upstream error ${res.status}`, status: 502 };
    }
  }
  const data: unknown = await res.json();

  const collectTextDeep = (node: unknown, acc: string[] = [], depth = 0): string[] => {
    if (node == null || depth > 5) return acc;
    if (typeof node === "string") {
      const s = node.trim();
      if (s) acc.push(s);
      return acc;
    }
    if (Array.isArray(node)) {
      for (const v of node) collectTextDeep(v, acc, depth + 1);
      return acc;
    }
    if (isObject(node)) {
      for (const [k, v] of Object.entries(node)) {
        if (k === "text" && typeof v === "string" && (v as string).trim()) acc.push(v as string);
        else collectTextDeep(v, acc, depth + 1);
      }
    }
    return acc;
  };

  const c0 = deepGet(data, ["candidates", 0]);
  let joined = collectTextDeep(c0).join("\n").trim();
  if (!joined) joined = collectTextDeep(data).join("\n").trim();
  if (["model", "user", "assistant", "system"].includes(joined.toLowerCase())) joined = "";

  let textOut = joined;
  if (!textOut) {
    // Try compact fallback on alternate model
    const fb = opts.fallbackModel || "gemini-2.0-flash";
    if (fb && fb !== opts.model) {
      const limit = Math.min(input.existing.length, 5);
      const exShort = (input.existing.slice(0, limit) as string[]).map((e) => e.slice(0, 120));
      const compactUser = opts.userText.replace(/Existing definitions[\s\S]*?\n\nRules:/, () => {
        const list = exShort.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—";
        return `Existing definitions (do not repeat wording or meaning):\n${list}\n\nRules:`;
      });
      const res2 = await callOnce(fb, compactUser);
      if (res2.ok) {
        const data2: unknown = await res2.json();
        const c02 = deepGet(data2, ["candidates", 0]);
        let out = collectTextDeep(c02).join("\n").trim();
        if (!out) out = collectTextDeep(data2).join("\n").trim();
        if (out && !["model", "user", "assistant", "system"].includes(out.toLowerCase())) textOut = out;
      }
    }
  }

  if (!textOut) {
    const promptFeedback = isObject(data)
      ? (data as Record<string, unknown>).promptFeedback
      : undefined;
    const blockReason = isObject(promptFeedback)
      ? (promptFeedback as Record<string, unknown>).blockReason
      : undefined;
    const finishReason = isObject(c0)
      ? (c0 as Record<string, unknown>).finishReason
      : undefined;
    const reason = String(
      (blockReason as unknown) ?? (finishReason as unknown) ?? "empty",
    );
    const usageMeta = isObject(data)
      ? (data as Record<string, unknown>).usageMetadata
      : undefined;
    const usage = isObject(usageMeta)
      ? (usageMeta as Record<string, unknown>)
      : {};
    const u = usage as {
      promptTokenCount?: unknown;
      candidatesTokenCount?: unknown;
      totalTokenCount?: unknown;
    };
    const usageStr = ` (prompt=${u.promptTokenCount ?? "?"}, candidates=${u.candidatesTokenCount ?? "?"}, total=${u.totalTokenCount ?? "?"})`;
    return { ok: false, message: `Gemini: ${reason}${usageStr}`, status: 502 };
  }
  return { ok: true, text: textOut };
}
