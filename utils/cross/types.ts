export type Cell = "*" | "#" | "↓" | "→" | "↘";
export type GridCell = Cell | ".";

export interface Grid {
  rows: number;
  cols: number;
  data: string[];
  marker: string;
  codes: number[][];
}

export const DIRS = {
  down: { dr: 1, dc: 0 },
  right: { dr: 0, dc: 1 },
} as const;

export interface Slot {
  id: number;
  r: number;
  c: number;
  dir: (typeof DIRS)[keyof typeof DIRS];
  len: number;
  cells: [number, number][];
}
