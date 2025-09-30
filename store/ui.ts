"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type AddDefCollapsed = { wordId: string; wordText?: string } | null;

type PanelSize = { width: number; height: number };

type State = {
  addDefCollapsed: AddDefCollapsed;
  panelSize: PanelSize;
};

type Actions = {
  collapseAddDef: (payload: { wordId: string; wordText?: string }) => void;
  clearAddDef: () => void;
  setPanelSize: (size: PanelSize) => void;
  resetPanelSize: () => void;
};

const DEFAULT_PANEL_SIZE: PanelSize = { width: 670, height: 430 };

export const useUiStore = create<State & Actions>()(
  persist(
    (set) => ({
      addDefCollapsed: null,
      panelSize: DEFAULT_PANEL_SIZE,
      collapseAddDef: (p) => set({ addDefCollapsed: p }),
      clearAddDef: () => set({ addDefCollapsed: null }),
      setPanelSize: (panelSize) => set({ panelSize }),
      resetPanelSize: () => set({ panelSize: DEFAULT_PANEL_SIZE }),
    }),
    {
      name: "ui-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (state, _version) => state as unknown as State & Actions,
      partialize: (s) => ({ panelSize: s.panelSize }),
    },
  ),
);
