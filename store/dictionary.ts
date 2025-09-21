"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type DictLang = string; // код языка из БД, не ограничен локалями UI

type State = {
  dictionaryLang: DictLang;
};

type Actions = {
  setDictionaryLang: (lang: DictLang) => void;
  reset: () => void;
};

export const useDictionaryStore = create<State & Actions>()(
  persist(
    (set) => ({
      dictionaryLang: "ru",
      setDictionaryLang: (dictionaryLang) => set({ dictionaryLang }),
      reset: () => set({ dictionaryLang: "ru" }),
    }),
    {
      name: "dictionary-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (state, _version) => state as unknown as State & Actions,
      partialize: (s) => ({ dictionaryLang: s.dictionaryLang }),
    },
  ),
);
