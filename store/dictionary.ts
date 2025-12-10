"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type DictLang = string; // код языка из БД, не ограничен локалями UI

// Фильтры словаря (совместимы с компонентами Filters/WordList)
export type DictionaryFilters = {
  q: string;
  scope: "word" | "def" | "both";
  tags?: string[];
  searchMode?: "contains" | "startsWith" | "exact";
  lenDir?: "asc" | "desc";
  lenFilterField?: "word" | "def";
  lenMin?: number;
  lenMax?: number;
  difficultyMin?: number;
  difficultyMax?: number;
  // Сортировка списка слов и определений (управляется в WordList)
  sortField?: "word"; // сейчас сортируем только по словам
  sortDir?: "asc" | "desc";
  defSortDir?: "asc" | "desc";
};

const DEFAULT_FILTERS: DictionaryFilters = {
  q: "",
  scope: "word",
  searchMode: "contains",
  lenDir: undefined,
  sortField: "word",
  sortDir: "asc",
  defSortDir: "asc",
};

type State = {
  dictionaryLang: DictLang;
  filters: DictionaryFilters;
};

type Actions = {
  setDictionaryLang: (lang: DictLang) => void;
  setFilters: (update: Partial<DictionaryFilters>) => void;
  resetFilters: () => void;
  reset: () => void;
};

export const useDictionaryStore = create<State & Actions>()(
  persist(
    (set) => ({
      dictionaryLang: "ru",
      filters: DEFAULT_FILTERS,
      setDictionaryLang: (dictionaryLang) => set({ dictionaryLang }),
      setFilters: (update) =>
        set((prev) => ({
          filters: { ...prev.filters, ...update },
        })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      reset: () => set({ dictionaryLang: "ru", filters: DEFAULT_FILTERS }),
    }),
    {
      name: "dictionary-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (state, _version) => state as unknown as State & Actions,
      // сохраняем только необходимые ключи
      partialize: (s) => ({ dictionaryLang: s.dictionaryLang, filters: s.filters }),
    },
  ),
);
