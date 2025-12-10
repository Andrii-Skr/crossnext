// Shared shapes for Gmail-like bulk selection.
export type DictionaryListItem = {
  id: string;
  word_text: string;
  is_pending_edit?: boolean;
  opred_v: Array<{
    id: string;
    text_opr: string;
    difficulty?: number | null;
    end_date?: string | null;
    is_pending_edit?: boolean;
    tags: { tag: { id: number; name: string } }[];
  }>;
};

// Filter snapshot that mirrors dictionary UI filters.
export type DictionaryFilterInput = {
  language: string;
  query?: string;
  scope?: "word" | "def" | "both";
  tagNames?: string[];
  searchMode?: "contains" | "startsWith" | "exact";
  lenFilterField?: "word" | "def";
  lenMin?: number;
  lenMax?: number;
  difficultyMin?: number;
  difficultyMax?: number;
};

export type BulkSelection =
  | { selectAllAcrossFilter?: false; ids: string[] }
  | { selectAllAcrossFilter: true; filter: DictionaryFilterInput; excludeIds?: string[] };

export type BulkTagPayload = {
  action: "applyTags";
  tagIds: number[];
} & BulkSelection;
