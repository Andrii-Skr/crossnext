"use client";
import { create } from "zustand";

type AddDefCollapsed = { wordId: string; wordText?: string } | null;

type UiState = {
  addDefCollapsed: AddDefCollapsed;
  collapseAddDef: (payload: { wordId: string; wordText?: string }) => void;
  clearAddDef: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  addDefCollapsed: null,
  collapseAddDef: (p) => set({ addDefCollapsed: p }),
  clearAddDef: () => set({ addDefCollapsed: null }),
}));

