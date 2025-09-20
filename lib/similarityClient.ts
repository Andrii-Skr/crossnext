import { diceCoefficient as dice } from "dice-coefficient";
import { SIMILARITY_CONFIG } from "@/lib/similarityConfig";

export type Lang = "ru" | "uk" | "en";
export type ExistingDef = { id: string | number; text: string; lang?: Lang };
export type NewDef = { text: string; lang?: Lang };
export type Options = {
  topK?: number;
  duplicateThreshold?: number;
  nearThreshold?: number;
  extraStopwords?: Partial<Record<Lang, string[]>>;
};

export type ResultItem = { id: string | number; text: string; percent: number };
export type CompareResult = {
  best: ResultItem | null;
  top: ResultItem[];
  duplicates: ResultItem[];
  similar: ResultItem[];
};

const RU_STOPWORDS = new Set([
  "и","в","во","не","что","он","на","я","с","со","как","а","то","все","она","так","его","но","да","ты","к","у","же","вы","за","бы","по","только","ее","мне","было","вот","от","меня","еще","нет","о","из","ему","теперь","когда","даже","ну","вдруг","ли","если","уже","или","ни","быть","был","него","до","вас","нибудь","опять","уж","вам","ведь","там","потом","себя","ничего","ей","может","они","тут","где","есть","надо","ней","для","мы","тебя","их","чем","была","сам","чтоб","без","будто","чего","раз","тоже","себе","под","будет","ж","тогда","кто","этот","того","потому","этого","какой","совсем","ним","здесь","этом","один","почти","мой","тем","чтобы","нее","кажется","сейчас","были","куда","зачем","всех","никогда","можно","при","наконец","два","об","другой","хоть","после","над","больше","тот","через","эти","нас","про","всего","них","какая","много","разве","три","эту","моя","впрочем","хорошо","свою","этой","перед","иногда","лучше","чуть","том","нельзя","такой","им","более","всегда","конечно","всю","между"
]);
const UK_STOPWORDS = new Set([
  "і","й","та","а","але","ще","ж","чи","що","який","яка","яке","які","в","у","на","по","до","з","із","зі","від","для","як","так","це","того","той","ця","ті","не","ні","же","вже","лише","тільки","аби","коли","де","тут","там","хто","я","ти","він","вона","воно","ми","ви","вони","його","її","їх","цього","цієї","цих","бути","є","був","була","було","були"
]);
const EN_STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","on","in","at","to","from","by","for","of","with","is","are","was","were","be","been","being","as","that","this","these","those","it","its","into","about","over","after","before","between","through","up","down","out","off","not","do","does","did","doing","so","such","than","too","very"
]);

function buildStopwords(extra?: Options["extraStopwords"]) {
  const ru = new Set(RU_STOPWORDS);
  const uk = new Set(UK_STOPWORDS);
  const en = new Set(EN_STOPWORDS);
  if (extra?.ru) for (const w of extra.ru) ru.add(w.toLowerCase());
  if (extra?.uk) for (const w of extra.uk) uk.add(w.toLowerCase());
  if (extra?.en) for (const w of extra.en) en.add(w.toLowerCase());
  return { ru, uk, en } as const;
}

function normalize(raw: string, lang?: Lang, stop = buildStopwords()) {
  if (!raw) return "";
  let s = raw.toLowerCase();
  s = s.replace(/ё/g, "е");
  s = s.normalize("NFKD").replace(/\p{M}+/gu, "");
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, " ");
  s = s.replace(/[\s\u00A0]+/g, " ").trim();
  if (!s) return "";
  let tokens = s.split(/\s+/);
  if (lang === "ru") tokens = tokens.filter((t) => !stop.ru.has(t));
  else if (lang === "uk") tokens = tokens.filter((t) => !stop.uk.has(t));
  else if (lang === "en") tokens = tokens.filter((t) => !stop.en.has(t));
  // no stemming on client
  return tokens.join(" ");
}

function toPercent(score: number): number {
  return Math.round(score * 10000) / 100;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const as = new Set(a);
  const bs = new Set(b);
  let inter = 0;
  for (const v of as) if (bs.has(v)) inter++;
  const union = as.size + bs.size - inter;
  if (union === 0) return 0;
  return inter / union;
}

function combinedSimilarity(normA: string, normB: string): number {
  const charDice = dice(normA, normB);
  const toksA = normA ? normA.split(/\s+/) : [];
  const toksB = normB ? normB.split(/\s+/) : [];
  const tokenJac = jaccard(toksA, toksB);
  return Math.max(charDice, tokenJac);
}

export type PreparedExisting = { id: string | number; text: string; norm: string }[];

export function prepareExisting(existing: ExistingDef[], options?: Options): PreparedExisting {
  const stop = buildStopwords(options?.extraStopwords);
  return existing.map((e) => ({ id: e.id, text: e.text, norm: normalize(e.text, e.lang, stop) }));
}

export function compareWithPrepared(newDef: NewDef, prepared: PreparedExisting, options?: Options): CompareResult {
  const stop = buildStopwords(options?.extraStopwords);
  const normNew = normalize(newDef.text, newDef.lang, stop);
  const scored: ResultItem[] = prepared.map((e) => ({ id: e.id, text: e.text, percent: toPercent(combinedSimilarity(normNew, e.norm)) }));
  scored.sort((a, b) => b.percent - a.percent);
  const topK = Math.max(1, options?.topK ?? SIMILARITY_CONFIG.topK);
  const dupThr = options?.duplicateThreshold ?? SIMILARITY_CONFIG.duplicateThreshold;
  const nearThr = options?.nearThreshold ?? SIMILARITY_CONFIG.nearThreshold;
  return {
    best: scored[0] ?? null,
    top: scored.slice(0, topK),
    duplicates: scored.filter((s) => s.percent >= dupThr),
    similar: scored.filter((s) => s.percent >= nearThr),
  };
}
