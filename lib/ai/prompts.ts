import type { Lang } from "@/lib/ai/types";

export const systemEn =
  "You are an assistant that writes one concise crossword-style definition. Follow the rules strictly.";

export function buildUserPrompt(
  language: Lang,
  word: string,
  existing: string[],
  maxLength: number,
): string {
  const langName: Record<Lang, string> = {
    ru: "Russian",
    uk: "Ukrainian",
    en: "English",
  };
  const list = existing.map((e, i) => `${i + 1}. ${e}`).join("\n") || "—";
  return `Task:\nWrite exactly one short, dictionary-style definition as used in crosswords.\n\nData:\n- Word: "${word}"\n- Max length (including spaces): ${maxLength}\n- Existing definitions (do not repeat wording or meaning):\n${list}\n\nRules:\n1) Exactly one line, ≤ ${maxLength} characters.\n2) No quotes, colons, brackets, numbering, or hints about letters/length.\n3) No period at the end; start with lowercase (proper nouns excepted).\n4) Do not use the word "${word}" nor its root/transliterated forms.\n5) Do not duplicate the meaning/wording of any item from the list.\n6) Style: short noun phrase (e.g., "forest ungulate", "place for storing wine").\n7) Prefer a different facet: genus–species, function, purpose, material, environment, distinctive feature.\n8) Avoid overly generic descriptions ("object", "something"), metaphors, comparisons, dates, trivia.\n9) If too long, shorten while preserving informativeness.\n\nOutput language: ${langName[language]}.\nReturn only the single definition line, with no explanations.`;
}
