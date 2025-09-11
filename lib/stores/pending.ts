"use client";
import { create } from "zustand";

export type PendingCounts = {
  total: number;
  words: number;
  descriptions: number;
};

type State = PendingCounts;
type Actions = {
  setCounts: (c: Partial<PendingCounts> | ((s: State) => Partial<PendingCounts>)) => void;
  decrement: (delta: { words?: number; descriptions?: number }) => void;
  increment: (delta: { words?: number; descriptions?: number }) => void;
  reset: () => void;
};

export const usePendingStore = create<State & Actions>((set) => ({
  total: 0,
  words: 0,
  descriptions: 0,
  setCounts: (partial) =>
    set((s) => {
      const p = typeof partial === "function" ? partial(s) : partial;
      const words = p.words ?? s.words;
      const descriptions = p.descriptions ?? s.descriptions;
      const total = p.total ?? words + descriptions;
      return { words, descriptions, total };
    }),
  decrement: (d) =>
    set((s) => {
      const words = Math.max(0, s.words - (d.words ?? 0));
      const descriptions = Math.max(0, s.descriptions - (d.descriptions ?? 0));
      return { words, descriptions, total: Math.max(0, words + descriptions) };
    }),
  increment: (d) =>
    set((s) => {
      const words = s.words + (d.words ?? 0);
      const descriptions = s.descriptions + (d.descriptions ?? 0);
      return { words, descriptions, total: Math.max(0, words + descriptions) };
    }),
  reset: () => set({ total: 0, words: 0, descriptions: 0 }),
}));

