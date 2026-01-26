export type FilterStats = {
  totalWords: number;
  totalDefs: number;
  difficultyCounts: Array<{ difficulty: number; count: number }>;
  tagCounts: Array<{ tagId: number; name: string; count: number }>;
  lengthCounts: Array<{ length: number; count: number }>;
};

export type DictionaryTemplateItem = {
  id: number;
  name: string;
  language: string;
  query: string | null;
  scope: "word" | "def" | "both" | string | null;
  searchMode: "contains" | "startsWith" | "exact" | string | null;
  lenFilterField: "word" | "def" | string | null;
  lenMin: number | null;
  lenMax: number | null;
  difficultyMin: number | null;
  difficultyMax: number | null;
  tagNames: string[];
};

export type DictionaryTemplatesResponse = { items: DictionaryTemplateItem[] };
