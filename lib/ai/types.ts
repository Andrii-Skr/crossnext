export type Lang = "ru" | "uk" | "en";

export type GenerateInput = {
  word: string;
  language: Lang;
  existing: string[];
  maxLength: number;
};

export type ProviderResult = { ok: true; text: string } | { ok: false; message: string; status?: number };
