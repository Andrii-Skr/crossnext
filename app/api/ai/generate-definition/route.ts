import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { buildUserPrompt, systemEn } from "@/lib/ai/prompts";
import { generateWithAnthropic } from "@/lib/ai/providers/anthropic";
import { generateWithGemini } from "@/lib/ai/providers/gemini";
import { generateWithOpenAI } from "@/lib/ai/providers/openai";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  word: z.string().min(1),
  language: z.enum(["ru", "uk", "en"]).default("ru"),
  existing: z.array(z.string()).default([]),
  // Accept numeric strings too; keep strict bounds
  maxLength: z.coerce.number().int().min(10).max(512).default(255),
});

type Body = z.infer<typeof schema>;

const aiLogEnabled = () =>
  ["1", "true", "yes"].includes(String(process.env.AI_LOG_ERRORS || "").toLowerCase());
const aiLog = (msg: string, meta?: Record<string, unknown>) => {
  if (aiLogEnabled()) console.error("[AI]", msg, meta || {});
};

export const POST = apiRoute<Body>(
  async (_req, body, _params, _user: Session["user"] | null) => {
    // Provider-agnostic config
    const provider = (process.env.AI_PROVIDER || "openai").toLowerCase(); // openai|anthropic|gemini
    const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const baseUrlOpenAI = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(
      /\/$/,
      "",
    );
    const apiKeyOpenAI = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY)?.trim();
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || apiKeyOpenAI;
    const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.AI_API_KEY?.trim();
    const geminiModel = process.env.GEMINI_MODEL || process.env.AI_MODEL || "gemini-2.0-flash";
    const baseUrlGemini = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(
      /\/$/,
      "",
    );
    const extraHeadersRaw = process.env.AI_EXTRA_HEADERS || ""; // JSON object to merge into headers
    let extraHeaders: Record<string, string> = {};
    try {
      if (extraHeadersRaw) extraHeaders = JSON.parse(extraHeadersRaw);
    } catch {
      // ignore malformed
    }

    const requireKey = !["0", "false", "no"].includes(String(process.env.AI_REQUIRE_API_KEY || "1").toLowerCase());
    if (provider === "openai" && requireKey && !apiKeyOpenAI) {
      aiLog("Provider not configured", {
        provider,
        requireKey,
        hasOpenAIKey: Boolean(apiKeyOpenAI),
        baseUrlOpenAI,
      });
      return NextResponse.json(
        {
          success: false,
          message: "AI provider is not configured",
        },
        {
          status: 400,
        },
      );
    }
    if (provider === "anthropic" && requireKey && !anthropicKey) {
      aiLog("Provider not configured", {
        provider,
        requireKey,
        hasAnthropicKey: Boolean(anthropicKey),
      });
      return NextResponse.json(
        {
          success: false,
          message: "AI provider is not configured",
        },
        {
          status: 400,
        },
      );
    }
    if (provider === "gemini" && requireKey && !geminiKey) {
      aiLog("Provider not configured", {
        provider,
        requireKey,
        hasGeminiKey: Boolean(geminiKey),
        baseUrlGemini,
        geminiModel,
      });
      return NextResponse.json(
        {
          success: false,
          message: "AI provider is not configured",
        },
        {
          status: 400,
        },
      );
    }

    const { word, existing, language, maxLength } = body;
    const timeoutMs = Math.max(1000, Math.min(60000, Number(process.env.AI_TIMEOUT_MS) || 20000));

    try {
      let textOut = "";
      if (provider === "anthropic") {
        const r = await generateWithAnthropic(
          {
            word,
            language,
            existing,
            maxLength,
          },
          {
            apiKey: anthropicKey,
            model: process.env.ANTHROPIC_MODEL || model,
            version: process.env.ANTHROPIC_VERSION || "2023-06-01",
            extraHeaders,
            systemText: systemEn,
            userText: buildUserPrompt(language, word, existing, maxLength),
            timeoutMs,
          },
        );
        if (!r.ok) {
          aiLog("Anthropic generation failed", { status: r.status, message: r.message });
          return NextResponse.json(
            {
              success: false,
              message: r.message,
            },
            {
              status: r.status || 502,
            },
          );
        }
        textOut = r.text;
      } else if (provider === "gemini") {
        const r = await generateWithGemini(
          {
            word,
            language,
            existing,
            maxLength,
          },
          {
            baseUrl: baseUrlGemini,
            apiKey: geminiKey,
            model: geminiModel,
            fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-2.0-flash",
            pathTemplate: process.env.GEMINI_PATH,
            authHeader: process.env.GEMINI_AUTH_HEADER?.trim(),
            extraHeaders,
            systemText: systemEn,
            userText: buildUserPrompt(language, word, existing, maxLength),
            timeoutMs,
          },
        );
        if (!r.ok) {
          aiLog("Gemini generation failed", { status: r.status, message: r.message });
          return NextResponse.json(
            {
              success: false,
              message: r.message,
            },
            {
              status: r.status || 502,
            },
          );
        }
        textOut = r.text;
      } else {
        const r = await generateWithOpenAI(
          {
            word,
            language,
            existing,
            maxLength,
          },
          {
            baseUrl: baseUrlOpenAI,
            apiKey: apiKeyOpenAI,
            model,
            extraHeaders,
            systemText: systemEn,
            userText: buildUserPrompt(language, word, existing, maxLength),
            path: process.env.AI_PATH || "/v1/chat/completions",
            authHeader: process.env.AI_AUTH_HEADER || "Authorization",
            authScheme: process.env.AI_AUTH_SCHEME ?? "Bearer",
            timeoutMs,
          },
        );
        if (!r.ok) {
          aiLog("OpenAI generation failed", { status: r.status, message: r.message });
          return NextResponse.json(
            {
              success: false,
              message: r.message,
            },
            {
              status: r.status || 502,
            },
          );
        }
        textOut = r.text;
      }
      const cleaned = (textOut || "")
        .trim()
        .replace(/^\p{Pd}+\s*/u, "")
        .replace(/^"|"$/g, "")
        .split(/\r?\n/)[0]
        .slice(0, maxLength);

      // Final guard: avoid returning role markers or placeholders as a valid definition
      const cleanedLc = cleaned.toLowerCase();
      const badSingles = new Set(["model", "assistant", "user", "system", "null", "undefined"]);
      if (badSingles.has(cleanedLc) || /^(model|assistant|user|system)\s*:$/i.test(cleaned)) {
        aiLog("AI returned invalid content", { provider });
        return NextResponse.json(
          {
            success: false,
            message: "AI returned invalid content",
          },
          {
            status: 502,
          },
        );
      }

      if (!cleaned) {
        aiLog("AI returned empty response", { provider });
        return NextResponse.json(
          {
            success: false,
            message: "Empty response",
          },
          {
            status: 500,
          },
        );
      }

      return NextResponse.json({
        success: true,
        text: cleaned,
      });
    } catch (e: unknown) {
      const msg =
        (
          e as {
            message?: string;
          }
        )?.message || "AI request failed";
      aiLog("AI route exception", { provider, message: msg });
      return NextResponse.json(
        {
          success: false,
          message: msg,
        },
        {
          status: 500,
        },
      );
    }
  },
  {
    schema,
    requireAuth: true,
  },
);
