import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { apiRoute } from "@/utils/appRoute";

const schema = z.object({
  word: z.string().min(1),
  language: z.enum(["ru", "uk", "en"]).default("ru"),
  existing: z.array(z.string()).default([]),
  // Accept numeric strings too; keep strict bounds
  maxLength: z.coerce.number().int().min(10).max(512).default(255),
});

type Body = z.infer<typeof schema>;

export const POST = apiRoute<Body>(
  async (_req, body, _params, _user: Session["user"] | null) => {
    // Helpers to traverse unknown JSON safely (no explicit any)
    const isObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null;
    const deepGet = (obj: unknown, path: Array<string | number>): unknown => {
      let cur: unknown = obj;
      for (const key of path) {
        if (Array.isArray(cur) && typeof key === "number") {
          cur = cur[key];
        } else if (isObject(cur) && typeof key === "string") {
          cur = cur[key];
        } else {
          return undefined;
        }
      }
      return cur;
    };
    // Provider-agnostic config
    const provider = (process.env.AI_PROVIDER || "openai").toLowerCase(); // openai|anthropic|gemini
    const model =
      process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const baseUrlOpenAI = (
      process.env.AI_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      "https://api.openai.com"
    ).replace(/\/$/, "");
    const apiKeyOpenAI = (
      process.env.AI_API_KEY || process.env.OPENAI_API_KEY
    )?.trim();
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || apiKeyOpenAI;
    const geminiKey =
      process.env.GEMINI_API_KEY?.trim() || process.env.AI_API_KEY?.trim();
    // Prefer provider-specific model; fall back to generic AI_MODEL; finally a sane Gemini default
    const geminiModel =
      process.env.GEMINI_MODEL || process.env.AI_MODEL || "gemini-2.0-flash";
    const baseUrlGemini = (
      process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com"
    ).replace(/\/$/, "");
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
    if (provider === "anthropic" && requireKey && !anthropicKey) {
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
    const localeText: Record<
      Body["language"],
      { system: string; user: string }
    > = {
      ru: {
        system:
          "Сгенерируй одно краткое определение для кроссворда. Строго следуй правилам.",
        user: `Данные:
- Слово: "${word}"
- Макс. длина (включая пробелы): ${maxLength}
- Уже существующие определения (не повторять по формулировке и смыслу):
${existing.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—"}

Правила:
1) Ровно одна строка, ≤ ${maxLength} символов.
2) Без кавычек, двоеточий, скобок, номера, подсказок про буквы/длину.
3) Без точки в конце; начинать со строчной буквы (кроме имен собственных).
4) Не использовать слово "${word}" и его однокоренные/транслитерированные формы.
5) Не дублировать по смыслу/формулировке ни одно из существующих из списка.
6) Стиль «словарный»: краткая именная группа/существительное (напр. «лесное копытное», «место хранения вина»).
7) По возможности выбрать другую грань значения: род–вид, функция, назначение, материал, среда, отличительный признак.
8) Избегать слишком общих описаний («предмет», «нечто»), метафор, сравнений, дат, справок.
9) Если длина превышена — сократи формулировку, сохрани информативность.

Вывод:
Верни только одну строку-определение, без каких-либо пояснений.`,
      },
      uk: {
        system:
          "Згенеруй одне коротке визначення для кросворду. Суворо дотримуйся правил.",
        user: `Дані:
- Слово: "${word}"
- Макс. довжина (включно з пробілами): ${maxLength}
- Вже наявні визначення (не повторювати формулювання і зміст):
${existing.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—"}

Правила:
1) Рівно один рядок, ≤ ${maxLength} символів.
2) Без лапок, двокрапок, дужок, нумерації, підказок про літери/довжину.
3) Без крапки в кінці; починай з малої літери (окрім власних назв).
4) Не використовуй слово "${word}" та його споріднені/транслітеровані форми.
5) Не дублюй за змістом/формулюванням жодне з наявних зі списку.
6) Стиль «словниковий»: коротка іменна група/іменник (напр., «лісове копитне», «місце зберігання вина»).
7) За можливості обери інший бік значення: рід–вид, функція, призначення, матеріал, середовище, відмінна ознака.
8) Уникай занадто загальних описів («предмет», «щось»), метафор, порівнянь, дат, довідок.
9) Якщо довжину перевищено — скороти формулювання, збережи інформативність.

Вивід:
Поверни лише один рядок-визначення, без жодних пояснень.`,
      },
      en: {
        system:
          "Generate one concise crossword-style definition. Follow the rules strictly.",
        user: `Data:
- Word: "${word}"
- Max length (including spaces): ${maxLength}
- Existing definitions (do not repeat wording or meaning):
${existing.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—"}

Rules:
1) Exactly one line, ≤ ${maxLength} characters.
2) No quotes, colons, brackets, numbering, or hints about letters/length.
3) No period at the end; start with lowercase (proper nouns excepted).
4) Do not use the word "${word}" or its root/transliterated forms.
5) Do not duplicate the meaning/wording of any existing item from the list.
6) Dictionary style: short noun phrase (e.g., "forest ungulate", "place for storing wine").
7) Prefer a different facet: genus–species, function, purpose, material, environment, distinctive feature.
8) Avoid overly generic descriptions ("object", "something"), metaphors, comparisons, dates, trivia.
9) If too long, shorten while preserving informativeness.

Output:
Return only a single definition line with no explanations.`,
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
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `${localeText[language].system}\n\n${localeText[language].user}`,
                  },
                ],
              },
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
        const data: unknown = await res.json();
        const raw = deepGet(data, ["content", 0, "text"]);
        const content =
          typeof raw === "string"
            ? raw
            : String(
                (isObject(raw)
                  ? (raw as { toString?: () => string }).toString?.()
                  : undefined) ?? "",
              );
        textOut = content;
      } else if (provider === "gemini") {
        // Google Gemini (Generative Language API)
        // force path from model to avoid env drift
        const path = `/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
        const url = `${baseUrlGemini}${path}${geminiKey ? `?key=${encodeURIComponent(geminiKey)}` : ""}`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // auth via ?key=... only; header removed
            ...extraHeaders,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: localeText[language].system }],
            },
            contents: [
              { role: "user", parts: [{ text: localeText[language].user }] },
            ],
            generationConfig: {
              temperature: 0.7,
              responseMimeType: "text/plain",
              // increased cap; still single-line output
              maxOutputTokens: Math.max(
                256,
                Math.min(2048, Math.ceil(maxLength * 4)),
              ),
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
        const data: unknown = await res.json();
        // Try to assemble text from different shapes used by Gemini models
        const readParts = (parts: unknown): string => {
          if (!Array.isArray(parts)) return "";
          const out: string[] = [];
          for (const p of parts) {
            if (isObject(p)) {
              const t = p.text;
              if (typeof t === "string" && t) out.push(t);
            }
          }
          return out.filter(Boolean).join("\n").trim();
        };
        // Ultra-robust fallback: collect any nested `text` fields
        const collectTextDeep = (
          node: unknown,
          acc: string[] = [],
          depth = 0,
        ): string[] => {
          if (node == null || depth > 5) return acc; // prevent deep recursion
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
              if (k === "text" && typeof v === "string" && (v as string).trim())
                acc.push(v as string);
              else collectTextDeep(v, acc, depth + 1);
            }
          }
          return acc;
        };
        const c0 = deepGet(data, ["candidates", 0]);
        const contentObj = isObject(c0)
          ? c0.content
          : Array.isArray(c0)
            ? c0
            : undefined;
        let joined = "";
        // Shape A: { candidates: [{ content: { parts: [...] } }] }
        if (!joined && isObject(contentObj))
          joined = readParts(contentObj.parts);
        // Shape B: { candidates: [{ content: [{ parts: [...] }] }] }
        if (!joined && Array.isArray(contentObj)) {
          joined = contentObj
            .map((x) => (isObject(x) ? readParts(x.parts) : ""))
            .filter(Boolean)
            .join("\n");
        }
        // Shape C: fallback to direct text fields if present
        if (!joined) {
          const direct = isObject(contentObj)
            ? typeof contentObj.text === "string"
              ? contentObj.text
              : ""
            : Array.isArray(contentObj) &&
                isObject(contentObj[0]) &&
                typeof contentObj[0].text === "string"
              ? contentObj[0].text
              : "";
          if (direct) joined = String(direct).trim();
        }
        // Shape D: deep-collect any text fields (last resort)
        if (!joined) {
          const deep =
            collectTextDeep(c0).join("\n").trim() ||
            collectTextDeep(data).join("\n").trim();
          joined = deep;
        }
        // Guard against accidentally capturing role labels like "model"
        if (
          ["model", "user", "assistant", "system"].includes(
            joined.toLowerCase(),
          )
        ) {
          joined = "";
        }
        textOut = joined;
        // Try fallback Gemini model early if we got an invalid role marker or empty
        if (
          !textOut ||
          ["model", "user", "assistant", "system"].includes(
            textOut.toLowerCase(),
          )
        ) {
          const fbModel =
            process.env.GEMINI_FALLBACK_MODEL || "gemini-2.0-flash";
          if (fbModel && fbModel !== geminiModel) {
            const fbPath = `/v1beta/models/${encodeURIComponent(fbModel)}:generateContent`;
            const fbUrl = `${baseUrlGemini}${fbPath}${geminiKey ? `?key=${encodeURIComponent(geminiKey)}` : ""}`;
            const limit = Math.min(existing.length, 5);
            const exShort = (existing.slice(0, limit) as string[]).map((e) =>
              e.slice(0, 120),
            );
            const list =
              exShort.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—";
            const userCompact =
              language === "ru"
                ? `Данные:
- Слово: "${word}"
- Макс. длина (включая пробелы): ${maxLength}
- Уже существующие определения (не повторять по формулировке и смыслу):
${list}

Правила:
1) Ровно одна строка, ≤ ${maxLength} символов.
2) Без кавычек, двоеточий, скобок, номера, подсказок про буквы/длину.
3) Без точки в конце; начинать со строчной буквы (кроме имен собственных).
4) Не использовать слово "${word}" и его однокоренные/транслитерированные формы.
5) Не дублировать по смыслу/формулировке ни одно из существующих из списка.
6) Стиль «словарный»: краткая именная группа/существительное.
7) По возможности выбрать другую грань значения.
8) Избегать слишком общих описаний, метафор, сравнений, дат, справок.
9) Если длина превышена — сократи формулировку.

Вывод:
Верни только одну строку-определение, без пояснений.`
                : language === "uk"
                  ? `Дані:
- Слово: "${word}"
- Макс. довжина (включно з пробілами): ${maxLength}
- Вже наявні визначення (не повторювати формулювання і зміст):
${list}

Правила:
1) Рівно один рядок, ≤ ${maxLength} символів.
2) Без лапок, двокрапок, дужок, нумерації, підказок про літери/довжину.
3) Без крапки в кінці; починай з малої літери (окрім власних назв).
4) Не використовуй слово "${word}" та його споріднені/транслітеровані форми.
5) Не дублюй за змістом/формулюванням жодне з наявних зі списку.
6) Стиль «словниковий»: коротка іменна група/іменник.
7) За можливості обери інший бік значення.
8) Уникай надто загальних описів, метафор, порівнянь, дат, довідок.
9) Якщо довжину перевищено — скороти формулювання.

Вивід:
Поверни лише один рядок-визначення, без пояснень.`
                  : `Data:
- Word: "${word}"
- Max length (including spaces): ${maxLength}
- Existing definitions (do not repeat wording/meaning):
${list}

Rules:
1) Exactly one line, ≤ ${maxLength} characters.
2) No quotes, colons, brackets, numbering, or hints about letters/length.
3) No period at the end; start with lowercase (proper nouns excepted).
4) Do not use the word "${word}" or its root/transliterated forms.
5) Do not duplicate the meaning/wording of any existing item.
6) Dictionary style: short noun phrase.
7) Prefer a different facet of meaning.
8) Avoid overly generic descriptions, metaphors, comparisons, dates, trivia.
9) If too long, shorten while preserving informativeness.

Output:
Return only a single definition line, with no explanations.`;
            const resFb = await fetch(fbUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                // auth via ?key=... only; header removed
                ...extraHeaders,
              },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{ text: localeText[language].system }],
                },
                contents: [{ role: "user", parts: [{ text: userCompact }] }],
                generationConfig: {
                  temperature: 0.7,
                  responseMimeType: "text/plain",
                  maxOutputTokens: Math.max(
                    256,
                    Math.min(2048, Math.ceil(maxLength * 4)),
                  ),
                },
              }),
            });
            if (resFb.ok) {
              const dataFb: unknown = await resFb.json();
              const cFb = deepGet(dataFb, ["candidates", 0]);
              const contentFb = isObject(cFb)
                ? cFb.content
                : Array.isArray(cFb)
                  ? cFb
                  : undefined;
              let out = isObject(contentFb) ? readParts(contentFb.parts) : "";
              if (!out && Array.isArray(contentFb))
                out = contentFb
                  .map((x) => (isObject(x) ? readParts(x.parts) : ""))
                  .filter(Boolean)
                  .join("\n");
              if (!out) {
                const direct = isObject(contentFb)
                  ? typeof contentFb.text === "string"
                    ? contentFb.text
                    : ""
                  : Array.isArray(contentFb) &&
                      isObject(contentFb[0]) &&
                      typeof contentFb[0].text === "string"
                    ? contentFb[0].text
                    : "";
                if (direct) out = String(direct).trim();
              }
              if (
                out &&
                !["model", "user", "assistant", "system"].includes(
                  out.toLowerCase(),
                )
              ) {
                textOut = out;
              }
            }
          }
        }
        if (!textOut) {
          const reason = String(
            (deepGet(data, ["promptFeedback", "blockReason"]) as
              | string
              | undefined) ||
              (isObject(c0)
                ? (c0 as { finishReason?: unknown }).finishReason
                : undefined) ||
              "empty",
          );
          const usage =
            isObject(data) &&
            isObject((data as Record<string, unknown>).usageMetadata)
              ? ((data as Record<string, unknown>).usageMetadata as Record<
                  string,
                  unknown
                >)
              : {};
          const usageStr = ` (prompt=${usage.promptTokenCount ?? "?"}, candidates=${usage.candidatesTokenCount ?? "?"}, total=${usage.totalTokenCount ?? "?"})`;
          if (reason === "MAX_TOKENS") {
            // Retry once with a larger cap
            // Also compact the list of existing definitions to reduce prompt size
            const limit = Math.min(existing.length, 5);
            const exShort = (existing.slice(0, limit) as string[]).map((e) =>
              e.slice(0, 120),
            );
            const list =
              exShort.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—";
            const userCompact =
              language === "ru"
                ? `Данные:
- Слово: "${word}"
- Макс. длина (включая пробелы): ${maxLength}
- Уже существующие определения (не повторять по формулировке и смыслу):
${list}

Правила:
1) Ровно одна строка, ≤ ${maxLength} символов.
2) Без кавычек, двоеточий, скобок, номера, подсказок про буквы/длину.
3) Без точки в конце; начинать со строчной буквы (кроме имен собственных).
4) Не использовать слово "${word}" и его однокоренные/транслитерированные формы.
5) Не дублировать по смыслу/формулировке ни одно из существующих из списка.
6) Стиль «словарный»: краткая именная группа/существительное.
7) По возможности выбрать другую грань значения.
8) Избегать слишком общих описаний, метафор, сравнений, дат, справок.
9) Если длина превышена — сократи формулировку.

Вывод:
Верни только одну строку-определение, без пояснений.`
                : language === "uk"
                  ? `Дані:
- Слово: "${word}"
- Макс. довжина (включно з пробілами): ${maxLength}
- Вже наявні визначення (не повторювати формулювання і зміст):
${list}

Правила:
1) Рівно один рядок, ≤ ${maxLength} символів.
2) Без лапок, двокрапок, дужок, нумерації, підказок про літери/довжину.
3) Без крапки в кінці; починай з малої літери (окрім власних назв).
4) Не використовуй слово "${word}" та його споріднені/транслітеровані форми.
5) Не дублюй за змістом/формулюванням жодне з наявних зі списку.
6) Стиль «словниковий»: коротка іменна група/іменник.
7) За можливості обери інший бік значення.
8) Уникай надто загальних описів, метафор, порівнянь, дат, довідок.
9) Якщо довжину перевищено — скороти формулювання.

Вивід:
Поверни лише один рядок-визначення, без пояснень.`
                  : `Data:
- Word: "${word}"
- Max length (including spaces): ${maxLength}
- Existing definitions (do not repeat wording/meaning):
${list}

Rules:
1) Exactly one line, ≤ ${maxLength} characters.
2) No quotes, colons, brackets, numbering, or hints about letters/length.
3) No period at the end; start with lowercase (proper nouns excepted).
4) Do not use the word "${word}" or its root/transliterated forms.
5) Do not duplicate the meaning/wording of any existing item.
6) Dictionary style: short noun phrase.
7) Prefer a different facet of meaning.
8) Avoid overly generic descriptions, metaphors, comparisons, dates, trivia.
9) If too long, shorten while preserving informativeness.

Output:
Return only a single definition line, with no explanations.`;
            const res2 = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                // auth via ?key=... only; header removed
                ...extraHeaders,
              },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{ text: localeText[language].system }],
                },
                contents: [{ role: "user", parts: [{ text: userCompact }] }],
                generationConfig: {
                  temperature: 0.7,
                  responseMimeType: "text/plain",
                  maxOutputTokens: Math.max(
                    256,
                    Math.min(2048, Math.ceil(maxLength * 4)),
                  ),
                },
              }),
            });
            if (!res2.ok) {
              const text2 = await res2.text().catch(() => "");
              return NextResponse.json(
                {
                  success: false,
                  message: text2 || `Upstream error ${res2.status}`,
                },
                { status: 502 },
              );
            }
            const data2: unknown = await res2.json();
            const c02 = deepGet(data2, ["candidates", 0]);
            const contentObj2 = isObject(c02)
              ? c02.content
              : Array.isArray(c02)
                ? c02
                : undefined;
            let joined2 = "";
            if (!joined2 && isObject(contentObj2))
              joined2 = readParts(contentObj2.parts);
            if (!joined2 && Array.isArray(contentObj2)) {
              joined2 = contentObj2
                .map((x) => (isObject(x) ? readParts(x.parts) : ""))
                .filter(Boolean)
                .join("\n");
            }
            if (!joined2) {
              const direct2 = isObject(contentObj2)
                ? typeof contentObj2.text === "string"
                  ? contentObj2.text
                  : ""
                : Array.isArray(contentObj2) &&
                    isObject(contentObj2[0]) &&
                    typeof contentObj2[0].text === "string"
                  ? contentObj2[0].text
                  : "";
              if (direct2) joined2 = String(direct2).trim();
            }
            if (!joined2) {
              const deep2 =
                collectTextDeep(c02).join("\n").trim() ||
                collectTextDeep(data2).join("\n").trim();
              joined2 = deep2;
            }
            if (
              ["model", "user", "assistant", "system"].includes(
                joined2.toLowerCase(),
              )
            ) {
              joined2 = "";
            }
            textOut = joined2;
            // Fallback to older model if still invalid
            if (!textOut) {
              const fbModel =
                process.env.GEMINI_FALLBACK_MODEL || "gemini-2.0-flash";
              if (fbModel && fbModel !== geminiModel) {
                const fbPath = `/v1beta/models/${encodeURIComponent(fbModel)}:generateContent`;
                const fbUrl = `${baseUrlGemini}${fbPath}${geminiKey ? `?key=${encodeURIComponent(geminiKey)}` : ""}`;
                const limitFb = Math.min(existing.length, 5);
                const exShortFb = (existing.slice(0, limitFb) as string[]).map(
                  (e) => e.slice(0, 120),
                );
                const listFb =
                  exShortFb.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—";
                const userCompactFb =
                  language === "ru"
                    ? `Данные:
- Слово: "${word}"
- Макс. длина (включая пробелы): ${maxLength}
- Уже существующие определения (не повторять по формулировке и смыслу):
${listFb}

Правила:
1) Ровно одна строка, ≤ ${maxLength} символов.
2) Без кавычек, двоеточий, скобок, номера, подсказок про буквы/длину.
3) Без точки в конце; начинать со строчной буквы (кроме имен собственных).
4) Не использовать слово "${word}" и его однокоренные/транслитерированные формы.
5) Не дублировать по смыслу/формулировке ни одно из существующих из списка.
6) Стиль «словарный»: краткая именная группа/существительное.
7) По возможности выбрать другую грань значения.
8) Избегать слишком общих описаний, метафор, сравнений, дат, справок.
9) Если длина превышена — сократи формулировку.

Вывод:
Верни только одну строку-определение, без пояснений.`
                    : language === "uk"
                      ? `Дані:
- Слово: "${word}"
- Макс. довжина (включно з пробілами): ${maxLength}
- Вже наявні визначення (не повторювати формулювання і зміст):
${listFb}

Правила:
1) Рівно один рядок, ≤ ${maxLength} символів.
2) Без лапок, двокрапок, дужок, нумерації, підказок про літери/довжину.
3) Без крапки в кінці; починай з малої літери (окрім власних назв).
4) Не використовуй слово "${word}" та його споріднені/транслітеровані форми.
5) Не дублюй за змістом/формулюванням жодне з наявних зі списку.
6) Стиль «словниковий»: коротка іменна група/іменник.
7) За можливості обери інший бік значення.
8) Уникай надто загальних описів, метафор, порівнянь, дат, довідок.
9) Якщо довжину перевищено — скороти формулювання.

Вивід:
Поверни лише один рядок-визначення, без пояснень.`
                      : `Data:
- Word: "${word}"
- Max length (including spaces): ${maxLength}
- Existing definitions (do not repeat wording/meaning):
${listFb}

Rules:
1) Exactly one line, ≤ ${maxLength} characters.
2) No quotes, colons, brackets, numbering, or hints about letters/length.
3) No period at the end; start with lowercase (proper nouns excepted).
4) Do not use the word "${word}" or its root/transliterated forms.
5) Do not duplicate the meaning/wording of any existing item.
6) Dictionary style: short noun phrase.
7) Prefer a different facet of meaning.
8) Avoid overly generic descriptions, metaphors, comparisons, dates, trivia.
9) If too long, shorten while preserving informativeness.

Output:
Return only a single definition line, with no explanations.`;
                const resFb = await fetch(fbUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    // auth via ?key=... only; header removed
                    ...extraHeaders,
                  },
                  body: JSON.stringify({
                    systemInstruction: {
                      parts: [{ text: localeText[language].system }],
                    },
                    contents: [
                      { role: "user", parts: [{ text: userCompactFb }] },
                    ],
                    generationConfig: {
                      temperature: 0.7,
                      responseMimeType: "text/plain",
                      maxOutputTokens: Math.max(
                        256,
                        Math.min(2048, Math.ceil(maxLength * 4)),
                      ),
                    },
                  }),
                });
                if (resFb.ok) {
                  const dataFb: unknown = await resFb.json();
                  const cFb = deepGet(dataFb, ["candidates", 0]);
                  const contentFb = isObject(cFb)
                    ? cFb.content
                    : Array.isArray(cFb)
                      ? cFb
                      : undefined;
                  let out = isObject(contentFb)
                    ? readParts(contentFb.parts)
                    : "";
                  if (!out && Array.isArray(contentFb))
                    out = contentFb
                      .map((x) => (isObject(x) ? readParts(x.parts) : ""))
                      .filter(Boolean)
                      .join("\n");
                  if (!out) {
                    const directFb = isObject(contentFb)
                      ? typeof contentFb.text === "string"
                        ? contentFb.text
                        : ""
                      : Array.isArray(contentFb) &&
                          isObject(contentFb[0]) &&
                          typeof contentFb[0].text === "string"
                        ? contentFb[0].text
                        : "";
                    if (directFb) out = String(directFb).trim();
                  }
                  if (
                    out &&
                    !["model", "user", "assistant", "system"].includes(
                      out.toLowerCase(),
                    )
                  ) {
                    textOut = out;
                  }
                }
              }
            }
            if (!textOut) {
              const reason2 = String(
                (deepGet(data2, ["promptFeedback", "blockReason"]) as
                  | string
                  | undefined) ||
                  (isObject(c02)
                    ? (c02 as { finishReason?: unknown }).finishReason
                    : undefined) ||
                  reason,
              );
              const usage2 =
                isObject(data2) &&
                isObject((data2 as Record<string, unknown>).usageMetadata)
                  ? ((data2 as Record<string, unknown>).usageMetadata as Record<
                      string,
                      unknown
                    >)
                  : {};
              const usageStr2 = ` (prompt=${usage2.promptTokenCount ?? "?"}, candidates=${usage2.candidatesTokenCount ?? "?"}, total=${usage2.totalTokenCount ?? "?"})`;
              return NextResponse.json(
                { success: false, message: `Gemini: ${reason2}${usageStr2}` },
                { status: 502 },
              );
            }
          } else {
            return NextResponse.json(
              { success: false, message: `Gemini: ${reason}${usageStr}` },
              { status: 502 },
            );
          }
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
        if (apiKeyOpenAI)
          headers[authHeader] =
            `${authScheme ? `${authScheme} ` : ""}${apiKeyOpenAI}`;
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
        const data: unknown = await res.json();
        const raw = deepGet(data, ["choices", 0, "message", "content"]);
        const content: string =
          typeof raw === "string"
            ? raw
            : String(
                (isObject(raw)
                  ? (raw as { toString?: () => string }).toString?.()
                  : undefined) ?? "",
              );
        textOut = content;
      }
      const cleaned = (textOut || "")
        .trim()
        .replace(/^\p{Pd}+\s*/u, "")
        .replace(/^"|"$/g, "")
        .split(/\r?\n/)[0]
        .slice(0, maxLength);

      // Final guard: avoid returning role markers or placeholders as a valid definition
      const cleanedLc = cleaned.toLowerCase();
      const badSingles = new Set([
        "model",
        "assistant",
        "user",
        "system",
        "null",
        "undefined",
      ]);
      if (
        badSingles.has(cleanedLc) ||
        /^(model|assistant|user|system)\s*:$/i.test(cleaned)
      ) {
        return NextResponse.json(
          { success: false, message: "AI returned invalid content" },
          { status: 502 },
        );
      }

      if (!cleaned) {
        return NextResponse.json(
          { success: false, message: "Empty response" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, text: cleaned });
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "AI request failed";
      return NextResponse.json(
        { success: false, message: msg },
        { status: 500 },
      );
    }
  },
  { schema, requireAuth: true },
);
