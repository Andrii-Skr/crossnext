import { NextResponse } from "next/server";
import { z } from "zod";
import type { Session } from "next-auth";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  word: z.string().min(1),
  language: z.enum(["ru", "uk", "en"]).default("ru"),
  existing: z.array(z.string()).default([]),
  maxLength: z.number().int().min(10).max(512).default(255),
});

type Body = z.infer<typeof schema>;

export const POST = apiRoute<Body>(async (_req, body, _params, _user: Session["user"] | null) => {
  // Provider-agnostic config
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase(); // openai|anthropic|gemini
  const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const baseUrlOpenAI = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");
  const apiKeyOpenAI = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY)?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || apiKeyOpenAI;
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.AI_API_KEY?.trim();
  const geminiModel = process.env.GEMINI_MODEL || model;
  const baseUrlGemini = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const extraHeadersRaw = process.env.AI_EXTRA_HEADERS || ""; // JSON object to merge into headers
  let extraHeaders: Record<string, string> = {};
  try {
    if (extraHeadersRaw) extraHeaders = JSON.parse(extraHeadersRaw);
  } catch {
    // ignore malformed
  }

  const requireKey = !["0", "false", "no"].includes(
    String(process.env.AI_REQUIRE_API_KEY || "1").toLowerCase(),
  );
  if (provider === "openai" && requireKey && !apiKeyOpenAI) {
    return NextResponse.json(
      { success: false, message: "AI provider is not configured" },
      { status: 400 },
    );
  }
  if (provider === "anthropic" && !anthropicKey) {
    return NextResponse.json(
      { success: false, message: "AI provider is not configured" },
      { status: 400 },
    );
  }
  if (provider === "gemini" && requireKey && !geminiKey) {
    return NextResponse.json(
      { success: false, message: "AI provider is not configured" },
      { status: 400 },
    );
  }

  const { word, existing, language, maxLength } = body;

  // Build prompt in requested language
  const localeText: Record<typeof language, { system: string; user: string }> = {
    ru: {
      system:
        "Ты помощник, который пишет короткие, точные определения в стиле кроссвордов. Дай одно определение. Не используй само слово. Верни только определение, без кавычек и пояснений.",
      user:
        `Слово: "${word}". Язык: русский. Максимум символов: ${maxLength}. Существующие определения:\n${existing.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—"}\nСгенерируй НОВОЕ определение, не совпадающее с существующими, соответствующее стилю кроссвордов. Только строка определения.`,
    },
    uk: {
      system:
        "Ти помічник, що пише короткі, точні визначення у стилі кросвордів. Дай одне визначення. Не використовуй саме слово. Поверни лише визначення, без лапок і пояснень.",
      user:
        `Слово: "${word}". Мова: українська. Максимум символів: ${maxLength}. Існуючі визначення:\n${existing.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—"}\nЗгенеруй НОВЕ визначення, що не дублює існуючі та відповідає стилю кросвордів. Лише рядок визначення.`,
    },
    en: {
      system:
        "You write concise, precise crossword-style definitions. Provide one definition. Do not use the word itself. Return only the definition line, no quotes or explanations.",
      user:
        `Word: "${word}". Language: English. Max characters: ${maxLength}. Existing definitions:\n${existing.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—"}\nGenerate a NEW crossword-style definition that does not duplicate existing ones. Return only the definition line.`,
    },
  };

  try {
    let textOut = "";
    if (provider === "anthropic") {
      const res = await fetch(`https://api.anthropic.com/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey as string,
          "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
          ...extraHeaders,
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || model,
          max_tokens: Math.max(64, Math.min(300, Math.ceil(maxLength * 1.5))),
          messages: [
            { role: "user", content: [
              { type: "text", text: `${localeText[language].system}\n\n${localeText[language].user}` },
            ] },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json(
          { success: false, message: text || `Upstream error ${res.status}` },
          { status: 502 },
        );
      }
      const data = (await res.json()) as any;
      const content = data?.content?.[0]?.text?.toString?.() ?? "";
      textOut = content;
    } else if (provider === "gemini") {
      // Google Gemini (Generative Language API)
      const path = process.env.GEMINI_PATH || `/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
      const url = `${baseUrlGemini}${path}${geminiKey ? `?key=${encodeURIComponent(geminiKey)}` : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.GEMINI_AUTH_HEADER
            ? { [process.env.GEMINI_AUTH_HEADER]: geminiKey as string }
            : {}),
          ...extraHeaders,
        },
        body: JSON.stringify({
          systemInstruction: { role: "system", parts: [{ text: localeText[language].system }] },
          contents: [
            { role: "user", parts: [{ text: localeText[language].user }] },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: Math.max(64, Math.min(300, Math.ceil(maxLength * 2))),
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json(
          { success: false, message: text || `Upstream error ${res.status}` },
          { status: 502 },
        );
      }
      const data = (await res.json()) as any;
      // Try to assemble text from all parts
      const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
      const joined = Array.isArray(parts)
        ? parts
            .map((p) => (typeof p?.text === "string" ? p.text : ""))
            .filter(Boolean)
            .join("\n")
            .trim()
        : "";
      const content = joined || data?.candidates?.[0]?.content?.parts?.[0]?.text?.toString?.() || "";
      textOut = content;
      if (!textOut) {
        const reason =
          data?.promptFeedback?.blockReason ||
          data?.candidates?.[0]?.finishReason ||
          "empty";
        return NextResponse.json(
          { success: false, message: `Gemini: ${reason}` },
          { status: 502 },
        );
      }
    } else {
      // default: OpenAI-compatible Chat Completions
      const path = process.env.AI_PATH || "/v1/chat/completions";
      const authHeader = process.env.AI_AUTH_HEADER || "Authorization";
      const authScheme = process.env.AI_AUTH_SCHEME ?? "Bearer"; // can set to empty
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...extraHeaders,
      };
      if (apiKeyOpenAI) headers[authHeader] = `${authScheme ? authScheme + " " : ""}${apiKeyOpenAI}`;
      const res = await fetch(`${baseUrlOpenAI}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: localeText[language].system },
            { role: "user", content: localeText[language].user },
          ],
          temperature: 0.7,
          max_tokens: Math.max(24, Math.min(300, Math.ceil(maxLength * 1.5))),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json(
          { success: false, message: text || `Upstream error ${res.status}` },
          { status: 502 },
        );
      }
      const data = (await res.json()) as any;
      const content: string = data?.choices?.[0]?.message?.content?.toString?.() ?? "";
      textOut = content;
    }
    const cleaned = (textOut || "")
      .trim()
      .replace(/^\p{Pd}+\s*/u, "")
      .replace(/^"|"$/g, "")
      .split(/\r?\n/)[0]
      .slice(0, maxLength);

    if (!cleaned) {
      return NextResponse.json(
        { success: false, message: "Empty response" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, text: cleaned });
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || "AI request failed";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}, { schema, requireAuth: true });
